import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Text,
  SafeAreaView,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { useAuth } from "@/lib/auth";
import { Id } from "@repo/backend/dataModel";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatKES } from "@/lib/currency";
import { THEME } from "@/theme/design";
import { ReceiptModal } from "@/components/modals/ReceiptModal";

export default function PickerOrderDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const inputRef = React.useRef<TextInput>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Get picker's user data from Convex
  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    user?.id ? { clerkId: user.id } : "skip"
  );
  const pickerId = convexUser?._id;

  // Fetch order details
  const orderDetails = useQuery(
    api.data.picker_orders.getPickerOrderDetails,
    pickerId && id
      ? {
          pickerId: pickerId as Id<"users">,
          orderId: id as Id<"orders">,
        }
      : "skip"
  );

  const startPicking = useMutation(api.data.picker_orders.startPicking);
  const markReadyForPickup = useMutation(api.data.picker_orders.markReadyForPickup);
  const markItemPicked = useMutation(api.data.picker_orders.markItemPicked);
  const scanItem = useMutation(api.data.picker_orders.scanItem);

  // Focus input on mount and keep it focused
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current && !inputRef.current.isFocused()) {
        inputRef.current.focus();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBarcodeSubmit = async () => {
    if (!barcodeInput || !pickerId || !id) return;
    const code = barcodeInput.trim();
    setBarcodeInput(""); // Clear immediately

    try {
      const result = await scanItem({
        orderId: id as Id<"orders">,
        pickerId: pickerId as Id<"users">,
        barcode: code,
      });
      if (result.success) {
        // Optional: Add sound or haptic feedback here
      }
    } catch (e: any) {
      Alert.alert("Scan Error", e.message);
    }
  };

  const handleStartPicking = async () => {
    if (!pickerId || !id) return;

    setIsUpdating(true);
    try {
      await startPicking({
        pickerId: pickerId as Id<"users">,
        orderId: id as Id<"orders">,
      });
      Alert.alert("Success", "Order picking started");
    } catch (error) {
      Alert.alert("Error", "Failed to update order status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkReady = async () => {
    if (!pickerId || !id) return;

    const unpickedItems = orderDetails?.items?.filter(
      (item: any) => !item.is_picked
    );
    if (unpickedItems && unpickedItems.length > 0) {
      Alert.alert(
        "Items Not Ready",
        `${unpickedItems.length} item(s) have not been marked as picked. Mark order as ready anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Ready",
            style: "destructive",
            onPress: async () => {
              setIsUpdating(true);
              try {
                await markReadyForPickup({
                  pickerId: pickerId as Id<"users">,
                  orderId: id as Id<"orders">,
                });
                // Show receipt modal instead of navigating back immediately
                setShowReceiptModal(true);
              } catch (error) {
                Alert.alert("Error", "Failed to update order status");
              } finally {
                setIsUpdating(false);
              }
            },
          },
        ]
      );
    } else {
      setIsUpdating(true);
      try {
        await markReadyForPickup({
          pickerId: pickerId as Id<"users">,
          orderId: id as Id<"orders">,
        });
        // Show receipt modal instead of navigating back immediately
        setShowReceiptModal(true);
      } catch (error) {
        Alert.alert("Error", "Failed to update order status");
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleToggleItem = async (itemId: string) => {
    if (!pickerId || !orderDetails) return;

    const item = orderDetails.items?.find((i: any) => i._id === itemId);
    if (!item) return;

    const currentPicked = item.is_picked === true;
    const newPicked = !currentPicked;

    try {
      await markItemPicked({
        pickerId: pickerId as Id<"users">,
        orderId: id as Id<"orders">,
        itemId: itemId as Id<"order_items">,
        isPicked: newPicked,
      });
    } catch (error) {
      console.error("Error updating item:", error);
      Alert.alert("Error", "Failed to update item status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Confirmed":
        return THEME.colors.success;
      case "Processing":
        return THEME.colors.warning;
      case "Pickup":
        return THEME.colors.primary;
      default:
        return THEME.colors.textSecondary;
    }
  };

  if (!orderDetails) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: THEME.colors.primary + "15",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="list-outline" size={28} color={THEME.colors.primary} />
          </View>
          <ActivityIndicator size="small" color={THEME.colors.primary} />
          <Text style={[styles.loadingText, { marginTop: 12 }]}>
            Loading order details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(orderDetails.order_status);
  const allItemsPicked =
    orderDetails.items?.every((item: any) => item.is_picked === true) ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        ref={inputRef}
        style={{ height: 0, width: 0, opacity: 0 }}
        value={barcodeInput}
        onChangeText={setBarcodeInput}
        onSubmitEditing={handleBarcodeSubmit}
        autoFocus={true}
        blurOnSubmit={false}
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back-outline" size={24} color={THEME.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={styles.pickerBadge}>
          <Text style={styles.pickerBadgeText}>PICKER</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Summary Card */}
        {orderDetails.order_status === "Confirmed" && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Ionicons name="list-outline" size={20} color={THEME.colors.primary} />
              <Text style={styles.progressTitle}>Picking Progress</Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${((orderDetails.items?.filter((i: any) => i.is_picked).length || 0) / (orderDetails.items?.length || 1)) * 100}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.progressStats}>
              <Text style={styles.progressStatsText}>
                {orderDetails.items?.filter((i: any) => i.is_picked).length ||
                  0}{" "}
                of {orderDetails.items?.length || 0} items picked
              </Text>
              {!allItemsPicked && (
                <View style={styles.scannerIndicator}>
                  <Ionicons name="barcode-outline" size={16} color={THEME.colors.primary} />
                  <Text style={styles.scannerText}>Scanner Ready</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Order Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.orderInfo}>
              <Text style={styles.orderRef}>
                {orderDetails.reference ||
                  `Order #${String(orderDetails._id).slice(-6)}`}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: statusColor + "15",
                    borderColor: statusColor + "40",
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {orderDetails.order_status}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: statusColor + "12",
                  borderColor: statusColor + "25",
                },
              ]}
            >
              <Ionicons name="cube-outline" size={20} color={statusColor} />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Vendor & Customer Info */}
          <View style={styles.detailsContainer}>
            <View style={styles.detailSection}>
              <Text style={styles.sectionLabel}>Customer</Text>
              <Text style={styles.sectionValue}>
                {orderDetails.customer?.name || "Customer"}
              </Text>
              {orderDetails.customer?.phone && (
                <View style={styles.row}>
                  <Ionicons name="call-outline" size={14} color={THEME.colors.textSecondary} />
                  <Text style={styles.subValue}>
                    {orderDetails.customer.phone}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.dateContainer}>
              <Ionicons name="time-outline" size={14} color={THEME.colors.textSecondary} />
              <Text style={styles.dateText}>
                {new Date(orderDetails.order_date).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        </View>

        {/* Items Section */}
        <View style={styles.itemsHeaderContainer}>
          <Text style={styles.sectionHeader}>Items to Pick</Text>
          <View style={styles.itemsCountBadge}>
            <Text style={styles.itemsCountText}>
              {orderDetails.items?.length || 0}
            </Text>
          </View>
        </View>

        {orderDetails.items?.map((item: any, index: number) => {
          const isPicked = item.is_picked ?? false;
          const pickedQty = item.picked_quantity || 0;
          const totalQty = item.quantity;
          const progress = (pickedQty / totalQty) * 100;

          return (
            <View
              key={item._id}
              style={[
                styles.itemCard,
                isPicked ? styles.itemPicked : styles.itemUnpicked,
              ]}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemNumberBadge}>
                  <Text style={styles.itemNumberText}>{index + 1}</Text>
                </View>
                {isPicked && (
                  <View style={styles.pickedBadge}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="white" />
                    <Text style={styles.pickedBadgeText}>Picked</Text>
                  </View>
                )}
              </View>

              <View style={styles.itemContent}>
                <View style={styles.itemInfo}>
                  <Text
                    style={[styles.itemName, isPicked && styles.itemNamePicked]}
                  >
                    {item.name}
                  </Text>

                  {/* Quantity Progress */}
                  <View style={styles.quantityContainer}>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>
                        {pickedQty}/{totalQty}
                      </Text>
                    </View>
                    {item.unit_value && item.unit_type && (
                      <Text style={styles.itemDetail}>
                        {item.unit_value}
                        {item.unit_type}
                      </Text>
                    )}
                  </View>

                  {/* Progress Bar for partial picks */}
                  {!isPicked && pickedQty > 0 && (
                    <View style={styles.miniProgressBar}>
                      <View
                        style={[
                          styles.miniProgressFill,
                          { width: `${progress}%` },
                        ]}
                      />
                    </View>
                  )}
                </View>

                {orderDetails.order_status === "Confirmed" && (
                  <TouchableOpacity
                    onPress={() => handleToggleItem(item._id)}
                    style={[
                      styles.checkbox,
                      isPicked
                        ? styles.checkboxChecked
                        : styles.checkboxUnchecked,
                    ]}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isPicked && (
                      <Ionicons name="checkmark" size={18} color="white" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Special Instructions */}
        {orderDetails.special_instructions && (
          <View style={styles.specialInstructionsCard}>
            <View style={styles.rowStart}>
              <Ionicons name="alert-circle-outline" size={18} color={THEME.colors.warning} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.specialInstructionsTitle}>
                  Special Instructions
                </Text>
                <Text style={styles.specialInstructionsText}>
                  {orderDetails.special_instructions}
                </Text>
              </View>
            </View>
          </View>
        )}

        {orderDetails.order_status === "Pickup" && (
          <View style={styles.readyCard}>
            <Ionicons name="checkmark-circle-outline" size={32} color={THEME.colors.success} style={{ marginBottom: 8 }} />
            <Text style={styles.readyTitle}>Ready for Rider Pickup</Text>
            <Text style={styles.readySubtitle}>
              This order has been prepared and is waiting for the rider
            </Text>
            {orderDetails.rider && (
              <View style={styles.riderInfo}>
                <Text style={styles.riderLabel}>Assigned Rider:</Text>
                <Text style={styles.riderName}>{orderDetails.rider.name}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed Action Buttons at Bottom */}
      {orderDetails.order_status === "Confirmed" && (
        <View style={styles.footer}>
          {!allItemsPicked && (
            <View style={styles.footerHint}>
              <Ionicons name="alert-circle-outline" size={18} color={THEME.colors.warning} />
              <Text style={styles.footerHintText}>
                Pick all listed items to enable
              </Text>
            </View>
          )}

          {allItemsPicked && (
            <View style={styles.footerHint}>
              <Ionicons name="checkmark-circle-outline" size={18} color={THEME.colors.success} />
              <Text
                style={[styles.footerHintText, { color: THEME.colors.success }]}
              >
                All items picked - ready to mark for pickup
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleMarkReady}
            disabled={isUpdating || !allItemsPicked}
            style={[
              styles.mainButton,
              allItemsPicked
                ? styles.mainButtonActive
                : styles.mainButtonDisabled,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                <Text style={styles.mainButtonText}>Mark Ready for Pickup</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          router.back();
        }}
        orderData={{
          order: orderDetails,
          vendor: orderDetails?.vendor,
          customer: orderDetails?.customer,
          picker: convexUser
            ? {
                name: `${convexUser.first_name} ${convexUser.last_name}`,
              }
            : undefined,
          rider: orderDetails?.rider,
          items: orderDetails?.items,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: THEME.colors.textSecondary,
    fontSize: 14,
  },
  progressCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: THEME.colors.primary + "30",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: THEME.colors.success,
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressStatsText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  scannerIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: THEME.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: THEME.colors.surfaceSecondary,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.colors.text,
    flex: 1,
    marginLeft: 16,
  },
  pickerBadge: {
    backgroundColor: THEME.colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.primary + "30",
  },
  pickerBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
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
  },
  orderInfo: {
    flex: 1,
  },
  orderRef: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  iconContainer: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 16,
  },
  detailsContainer: {
    gap: 12,
  },
  detailSection: {
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 14,
    color: THEME.colors.text,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  rowStart: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  subValue: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    gap: 6,
  },
  dateText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: "600",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 12,
  },
  prescriptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconBox: {
    padding: 8,
    borderRadius: 10,
  },
  bgSuccess: { backgroundColor: THEME.colors.success + "20" },
  bgError: { backgroundColor: THEME.colors.error + "20" },
  bgWarning: { backgroundColor: THEME.colors.warning + "20" },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  textSuccess: { color: THEME.colors.success },
  textError: { color: THEME.colors.error },
  textWarning: { color: THEME.colors.warning },
  verifyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: THEME.colors.info + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.info + "30",
  },
  verifyButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.colors.info,
  },
  previewContainer: {
    marginTop: 8,
    gap: 8,
  },
  imageWrapper: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: THEME.colors.surfaceSecondary,
  },
  previewImage: {
    width: "100%",
    height: 180,
  },
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIconBg: {
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 10,
    borderRadius: 20,
  },
  previewHint: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: "center",
  },
  rejectionBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: THEME.colors.error + "10",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.error + "20",
  },
  rejectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.error,
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 14,
    color: THEME.colors.error,
  },
  actionContainer: {
    marginTop: 12,
    gap: 12,
  },
  warningBox: {
    padding: 12,
    backgroundColor: THEME.colors.warning + "10",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.warning + "20",
  },
  warningText: {
    fontSize: 13,
    color: THEME.colors.warning,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButton: {
    backgroundColor: THEME.colors.error,
  },
  approveButton: {
    backgroundColor: THEME.colors.success,
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  itemsHeaderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemsCountBadge: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  itemsCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  itemCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  itemPicked: {
    borderColor: THEME.colors.success,
  },
  itemUnpicked: {
    borderColor: THEME.colors.border,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.colors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  itemNumberText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  pickedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pickedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "white",
  },
  itemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginRight: 16,
  },
  itemName: {
    fontSize: 17,
    fontWeight: "600",
    color: THEME.colors.text,
    marginBottom: 8,
    lineHeight: 22,
  },
  itemNamePicked: {
    color: THEME.colors.textSecondary,
    opacity: 0.7,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  quantityBadge: {
    backgroundColor: THEME.colors.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  quantityText: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  itemDetail: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: "500",
  },
  miniProgressBar: {
    height: 4,
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 8,
  },
  miniProgressFill: {
    height: "100%",
    backgroundColor: THEME.colors.warning,
    borderRadius: 2,
  },
  instructionBox: {
    marginTop: 6,
    backgroundColor: THEME.colors.warning + "10",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  instructionText: {
    fontSize: 12,
    color: THEME.colors.warning,
  },
  checkbox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: THEME.colors.success,
    borderColor: THEME.colors.success,
  },
  checkboxUnchecked: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
  },
  specialInstructionsCard: {
    backgroundColor: THEME.colors.warning + "15",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: THEME.colors.warning + "40",
  },
  specialInstructionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.warning,
    marginBottom: 2,
  },
  specialInstructionsText: {
    fontSize: 14,
    color: THEME.colors.text,
  },
  readyCard: {
    backgroundColor: THEME.colors.success + "15",
    padding: 24,
    borderRadius: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: THEME.colors.success + "40",
    alignItems: "center",
  },
  readyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.success,
    marginTop: 8,
  },
  readySubtitle: {
    fontSize: 14,
    color: THEME.colors.text,
    marginTop: 4,
    textAlign: "center",
  },
  riderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  riderLabel: {
    fontSize: 14,
    color: THEME.colors.text,
  },
  riderName: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.colors.success,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 4,
  },
  footerHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 6,
  },
  footerHintText: {
    color: THEME.colors.warning,
    fontSize: 14,
    fontWeight: "500",
  },
  mainButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mainButtonActive: {
    backgroundColor: THEME.colors.success,
  },
  mainButtonDisabled: {
    backgroundColor: THEME.colors.border,
    opacity: 0.6,
  },
  mainButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
