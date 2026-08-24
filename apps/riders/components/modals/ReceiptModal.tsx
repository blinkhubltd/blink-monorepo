import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";
import { formatKES } from "@/lib/currency";
import { printReceipt } from "@/lib/printReceipt";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: {
    order: any;
    vendor?: any;
    customer?: any;
    picker?: any;
    rider?: any;
    items?: any[];
  };
}

export function ReceiptModal({
  isOpen,
  onClose,
  orderData,
}: ReceiptModalProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printReceipt({
        order: orderData.order,
        vendor: orderData.vendor,
        customer: orderData.customer,
        picker: orderData.picker,
        rider: orderData.rider,
        items: orderData.items,
      });
    } catch (error) {
      console.error("Print failed:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleClose = () => {
    sheetRef.current?.close();
    onClose();
  };

  const orderRef =
    orderData.order?.reference ||
    `#${String(orderData.order?._id).slice(-8).toUpperCase()}`;
  const itemCount = orderData.items?.length || 0;
  const totalAmount = orderData.order?.total_amount || 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["70%", "85%"]}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle-outline" size={28} color={THEME.colors.success} />
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Success Message */}
          <View style={styles.successSection}>
            <Text style={styles.successTitle}>Order Ready for Pickup!</Text>
            <Text style={styles.successSubtitle}>
              All items have been picked and the order is ready for the rider
            </Text>
          </View>

          {/* Order Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Ionicons name="cube-outline" size={20} color={THEME.colors.primary} />
              <Text style={styles.summaryTitle}>Order Summary</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Order Reference</Text>
              <Text style={styles.summaryValue}>{orderRef}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Amount</Text>
              <Text style={styles.summaryValueBold}>
                {formatKES(totalAmount)}
              </Text>
            </View>
          </View>

          {/* Team Info */}
          <View style={styles.teamCard}>
            <Text style={styles.teamTitle}>Prepared By</Text>

            {orderData.picker && (
              <View style={styles.teamRow}>
                <View style={styles.teamIconContainer}>
                  <Ionicons name="person-outline" size={16} color={THEME.colors.primary} />
                </View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamLabel}>Picker</Text>
                  <Text style={styles.teamName}>{orderData.picker.name}</Text>
                </View>
              </View>
            )}

            {orderData.rider && (
              <View style={styles.teamRow}>
                <View style={styles.teamIconContainer}>
                  <Ionicons name="bicycle-outline" size={16} color={THEME.colors.primary} />
                </View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamLabel}>Rider</Text>
                  <Text style={styles.teamName}>{orderData.rider.name}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Customer Privacy Note */}
          <View style={styles.privacyNote}>
            <Text style={styles.privacyText}>
              Customer contact information will be masked on the printed receipt
              for privacy
            </Text>
          </View>
        </ScrollView>

        {/* Print Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handlePrint}
            disabled={isPrinting}
            style={[
              styles.printButton,
              isPrinting && styles.printButtonDisabled,
            ]}
            activeOpacity={0.8}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="print-outline" size={20} color="white" />
                <Text style={styles.printButtonText}>Print Receipt</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClose}
            style={styles.laterButton}
            activeOpacity={0.7}
          >
            <Text style={styles.laterButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: THEME.colors.border,
    width: 40,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  successIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.success + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  successSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  summaryCard: {
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
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  summaryValueBold: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.primary,
  },
  teamCard: {
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  teamTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  teamIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  teamInfo: {
    flex: 1,
  },
  teamLabel: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  privacyNote: {
    backgroundColor: THEME.colors.info + "10",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.info + "30",
  },
  privacyText: {
    fontSize: 12,
    color: THEME.colors.text,
    lineHeight: 18,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  printButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: THEME.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  printButtonDisabled: {
    backgroundColor: THEME.colors.border,
    opacity: 0.6,
  },
  printButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  laterButton: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  laterButtonText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
});
