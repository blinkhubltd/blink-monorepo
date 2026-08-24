import React, { useState, useEffect } from "react";
import {
  Alert,
  RefreshControl,
  Image,
  Linking,
  Modal,
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { Id } from "@repo/backend/dataModel";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

export default function PrescriptionVerificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [prescriptionUrl, setPrescriptionUrl] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileType, setFileType] = useState<"image" | "pdf" | "unknown">(
    "unknown"
  );
  const [downloading, setDownloading] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    user?.id ? { clerkId: user.id } : "skip"
  );

  const awaitingPrescriptions = useQuery(
    api.data.prescriptions.getOrdersAwaitingPrescription,
    convexUser?._id ? { pickerId: convexUser._id } : "skip"
  );

  const prescriptionDocUrl = useQuery(
    api.data.prescriptions.getPrescriptionDocumentUrl,
    selectedPrescription?.prescription_document
      ? { storageId: selectedPrescription.prescription_document }
      : "skip"
  );

  // Mutations
  const updatePrescriptionStatus = useMutation(
    api.data.prescriptions.updatePrescriptionStatus
  );
  const updatePrescriptionStatusWithReason = useMutation(
    api.data.prescriptions.updatePrescriptionStatusWithReason
  );

  useEffect(() => {
    if (prescriptionDocUrl) {
      setPrescriptionUrl(prescriptionDocUrl);
      determineFileType(prescriptionDocUrl);
    }
  }, [prescriptionDocUrl]);

  const determineFileType = async (url: string) => {
    try {
      console.log("Prescription url: ", url);
      const response = await fetch(url, { method: "HEAD" });
      const contentType = response.headers.get("content-type");

      if (contentType) {
        if (contentType.includes("image")) {
          setFileType("image");
          return;
        } else if (contentType.includes("pdf")) {
          setFileType("pdf");
          return;
        }
      }
    } catch (error) {
      console.log("Could not fetch content-type, falling back to URL analysis");
    }

    const lowercaseUrl = url.toLowerCase();
    const urlWithoutParams = lowercaseUrl.split("?")[0];
    const extension = urlWithoutParams.split(".").pop();

    if (extension === "pdf") {
      setFileType("pdf");
    } else if (
      ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(
        extension || ""
      )
    ) {
      setFileType("image");
    } else if (
      lowercaseUrl.includes("image") ||
      lowercaseUrl.includes("/images/")
    ) {
      setFileType("image");
    } else {
      setFileType("image");
    }
  };

  const handleDownloadPDF = async () => {
    if (!prescriptionUrl) return;

    try {
      setDownloading(true);

      // Create a filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `prescription_${timestamp}.pdf`;
      const fileUri = FileSystem.documentDirectory + filename;

      const downloadResult = await FileSystem.downloadAsync(
        prescriptionUrl,
        fileUri
      );

      if (downloadResult.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: "application/pdf",
            dialogTitle: "Save or Share Prescription PDF",
          });
        } else {
          Alert.alert(
            "Downloaded",
            `Prescription PDF saved to: ${downloadResult.uri}`,
            [{ text: "OK" }]
          );
        }
      } else {
        throw new Error("Download failed");
      }
    } catch (error) {
      console.error("Error downloading PDF:", error);
      Alert.alert(
        "Download Error",
        "Failed to download the prescription PDF. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleSelectPrescription = (prescription: any) => {
    setSelectedPrescription(prescription);
    setRejectionNotes("");
    setPrescriptionUrl(null);
    setFileType("unknown");
  };

  const handleApprove = async () => {
    if (!selectedPrescription) return;

    setIsLoading(true);
    try {
      await updatePrescriptionStatus({
        prescriptionId: selectedPrescription._id as Id<"prescriptions">,
        status: "approved",
      });

      Alert.alert("Success", "Prescription approved successfully!", [
        {
          text: "OK",
          onPress: () => {
            setSelectedPrescription(null);
            setPrescriptionUrl(null);
            setFileType("unknown");
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to approve prescription");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPrescription) return;
    setShowRejectionModal(true);
  };

  const handleRejectionSubmit = async () => {
    if (!selectedPrescription) return;
    if (!rejectionNotes.trim()) {
      Alert.alert("Required", "Please provide a reason for rejection");
      return;
    }

    setIsLoading(true);
    try {
      await updatePrescriptionStatusWithReason({
        prescriptionId: selectedPrescription._id as Id<"prescriptions">,
        status: "rejected",
        customNotes: rejectionNotes.trim(),
      });

      Alert.alert("Success", "Prescription rejected successfully", [
        {
          text: "OK",
          onPress: () => {
            setSelectedPrescription(null);
            setPrescriptionUrl(null);
            setFileType("unknown");
            setRejectionNotes("");
            setShowRejectionModal(false);
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to reject prescription");
    } finally {
      setIsLoading(false);
    }
  };

  if (!convexUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {selectedPrescription ? (
        /* Prescription Review View */
        <View style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setSelectedPrescription(null)}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back-outline" size={24} color={THEME.colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review Prescription</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          >
            {/* Patient Information Header */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Patient Details</Text>
                  <View style={styles.row}>
                    <Ionicons name="person-outline" size={14} color={THEME.colors.textSecondary} />
                    <Text style={styles.patientName}>
                      {selectedPrescription.user?.first_name}{" "}
                      {selectedPrescription.user?.last_name}
                    </Text>
                  </View>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>PENDING REVIEW</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color={THEME.colors.textSecondary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Uploaded on</Text>
                  <Text style={styles.infoValue}>
                    {new Date(
                      selectedPrescription.uploaded_at
                    ).toLocaleDateString()}{" "}
                    at{" "}
                    {new Date(
                      selectedPrescription.uploaded_at
                    ).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Prescription Document */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.row}>
                  <Ionicons name="document-outline" size={18} color={THEME.colors.primary} />
                  <Text style={styles.sectionTitle}>Document</Text>
                </View>
                {fileType === "pdf" && prescriptionUrl && (
                  <TouchableOpacity
                    onPress={handleDownloadPDF}
                    disabled={downloading}
                    style={styles.downloadButton}
                  >
                    {downloading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons name="download-outline" size={16} color="white" />
                    )}
                    <Text style={styles.downloadButtonText}>Download PDF</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.documentContainer}>
                {prescriptionUrl ? (
                  <>
                    {fileType === "image" ? (
                      <View>
                        <View style={styles.imageContainer}>
                          <Image
                            source={{ uri: prescriptionUrl }}
                            style={styles.prescriptionImage}
                            resizeMode="contain"
                          />
                        </View>
                        <View style={styles.hintBox}>
                          <Ionicons name="search-outline" size={16} color={THEME.colors.primary} />
                          <Text style={styles.hintText}>
                            Verify doctor's signature and medication details.
                          </Text>
                        </View>
                      </View>
                    ) : fileType === "pdf" ? (
                      <View style={styles.pdfContainer}>
                        <Ionicons name="document-outline" size={48} color={THEME.colors.error} />
                        <Text style={styles.pdfTitle}>PDF Document</Text>
                        <Text style={styles.pdfSubtitle}>
                          Please download to view full details
                        </Text>
                        <TouchableOpacity
                          onPress={handleDownloadPDF}
                          style={styles.pdfButton}
                        >
                          <Ionicons name="share-outline" size={18} color="white" />
                          <Text style={styles.pdfButtonText}>Open PDF</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.unknownContainer}>
                        <Ionicons name="document-outline" size={48} color={THEME.colors.textSecondary} />
                        <Text style={styles.unknownTitle}>
                          Unknown File Type
                        </Text>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(prescriptionUrl)}
                          style={styles.openButton}
                        >
                          <Text style={styles.openButtonText}>Open File</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator
                      size="large"
                      color={THEME.colors.primary}
                    />
                    <Text style={styles.loadingText}>Loading document...</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.actionFooter}>
              <TouchableOpacity
                onPress={handleReject}
                disabled={isLoading}
                style={[styles.actionButton, styles.rejectButton]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="close-circle-outline" size={18} color="white" />
                )}
                <Text style={styles.actionButtonText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApprove}
                disabled={isLoading}
                style={[styles.actionButton, styles.approveButton]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={18} color="white" />
                )}
                <Text style={styles.actionButtonText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      ) : (
        /* Prescriptions List View */
        <View style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back-outline" size={24} color={THEME.colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Prescription Verification</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          >
            {!awaitingPrescriptions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={THEME.colors.primary} />
                <Text style={styles.loadingText}>Loading prescriptions...</Text>
              </View>
            ) : awaitingPrescriptions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={48} color={THEME.colors.success} />
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptySubtitle}>
                  No prescriptions require verification at the moment
                </Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>Pending Verification</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {awaitingPrescriptions.length}
                    </Text>
                  </View>
                </View>

                {awaitingPrescriptions.map((prescription: any) => (
                  <TouchableOpacity
                    key={prescription._id}
                    onPress={() => handleSelectPrescription(prescription)}
                    style={styles.prescriptionCard}
                  >
                    <View style={styles.prescriptionHeader}>
                      <View>
                        <Text style={styles.prescriptionRef}>
                          #{String(prescription._id).slice(-6)}
                        </Text>
                        <View style={styles.row}>
                          <Ionicons name="person-outline" size={14} color={THEME.colors.textSecondary} />
                          <Text style={styles.prescriptionUser}>
                            {prescription.user?.first_name}{" "}
                            {prescription.user?.last_name}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={THEME.colors.textSecondary} />
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.prescriptionFooter}>
                      <View style={styles.row}>
                        <Ionicons name="time-outline" size={14} color={THEME.colors.textSecondary} />
                        <Text style={styles.prescriptionDate}>
                          {new Date(
                            prescription.uploaded_at
                          ).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={styles.tapToReview}>Tap to review</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* Rejection Modal */}
      <Modal
        visible={showRejectionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRejectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Prescription</Text>
              <TouchableOpacity onPress={() => setShowRejectionModal(false)}>
                <Ionicons name="close-circle-outline" size={24} color={THEME.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Please provide a reason for rejecting this prescription. This will
              be sent to the customer.
            </Text>

            <TextInput
              style={styles.textArea}
              placeholder="Enter rejection reason..."
              multiline
              numberOfLines={4}
              value={rejectionNotes}
              onChangeText={setRejectionNotes}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowRejectionModal(false)}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRejectionSubmit}
                disabled={isLoading}
                style={[styles.modalButton, styles.confirmRejectButton]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.confirmRejectButtonText}>
                    Confirm Rejection
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  backButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: THEME.colors.textSecondary,
    fontSize: 14,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  patientName: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  badge: {
    backgroundColor: THEME.colors.warning + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME.colors.warning,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.colors.background,
    padding: 12,
    borderRadius: 8,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: THEME.colors.text,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  downloadButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  documentContainer: {
    marginTop: 12,
  },
  imageContainer: {
    backgroundColor: THEME.colors.background,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: THEME.colors.border,
    height: 400,
  },
  prescriptionImage: {
    width: "100%",
    height: "100%",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.colors.primary + "10",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    color: THEME.colors.primary,
    flex: 1,
  },
  pdfContainer: {
    alignItems: "center",
    padding: 32,
    backgroundColor: THEME.colors.error + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.error + "30",
  },
  pdfTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.error,
    marginTop: 12,
  },
  pdfSubtitle: {
    fontSize: 14,
    color: THEME.colors.error,
    marginTop: 4,
    marginBottom: 16,
  },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.colors.error,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  pdfButtonText: {
    color: "white",
    fontWeight: "600",
  },
  unknownContainer: {
    alignItems: "center",
    padding: 32,
    backgroundColor: THEME.colors.background,
    borderRadius: 12,
  },
  unknownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.colors.text,
    marginTop: 12,
    marginBottom: 16,
  },
  openButton: {
    backgroundColor: THEME.colors.text,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  openButtonText: {
    color: "white",
    fontWeight: "600",
  },
  guidelinesCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.primary + "30",
    borderWidth: 1,
  },
  checklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  checklist: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  bullet: {
    color: THEME.colors.primary,
    fontWeight: "bold",
    fontSize: 14,
  },
  checklistText: {
    fontSize: 14,
    color: THEME.colors.text,
    flex: 1,
    lineHeight: 20,
  },
  actionFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    backgroundColor: THEME.colors.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  rejectButton: {
    backgroundColor: THEME.colors.error,
  },
  approveButton: {
    backgroundColor: THEME.colors.success,
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  listContainer: {
    gap: 12,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  countBadge: {
    backgroundColor: THEME.colors.warning + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.colors.warning,
  },
  prescriptionCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 12,
  },
  prescriptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prescriptionRef: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 4,
  },
  prescriptionUser: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  prescriptionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prescriptionDate: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginLeft: 6,
  },
  tapToReview: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginBottom: 16,
  },
  textArea: {
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 12,
    padding: 16,
    height: 120,
    fontSize: 16,
    color: THEME.colors.text,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  confirmRejectButton: {
    backgroundColor: THEME.colors.error,
  },
  confirmRejectButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});
