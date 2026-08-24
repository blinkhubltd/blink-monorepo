import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";
import { formatDateTime } from "@/lib/datetime";

type OrderStatus = "Pending" | "Confirmed" | "Processing" | "Pickup";

type Props = {
  order: any;
  onPress: () => void;
  onPrimaryAction?: () => void;
  STATUS_COLORS: Record<string, string>;
};

const getStatusConfig = (status: OrderStatus) => {
  switch (status) {
    case "Pending":
      return {
        color: "#f59e0b",
        label: "Pending Assignment",
        iconName: "alert-circle-outline",
        action: null,
      };
    case "Confirmed":
      return {
        color: "#10b981",
        label: "Ready to Pick",
        iconName: "play-circle-outline",
        action: "Start Picking",
      };
    case "Processing":
      return {
        color: "#3b82f6",
        label: "Picking in Progress",
        iconName: "cube-outline",
        action: "Continue",
      };
    case "Pickup":
      return {
        color: "#8b5cf6",
        label: "Ready for Rider",
        iconName: "checkmark-circle-outline",
        action: null,
      };
    default:
      return {
        color: "#6b7280",
        label: status,
        iconName: "cube-outline",
        action: null,
      };
  }
};

export default function PickerOrderCard({
  order,
  onPress,
  onPrimaryAction,
  STATUS_COLORS,
}: Props) {
  const statusConfig = getStatusConfig(order.order_status as OrderStatus);
  const orderId =
    order.reference || `#${String(order._id).slice(-6).toUpperCase()}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.card, { borderColor: STATUS_COLORS.border }]}>
        {/* Status strip */}
        <View
          style={[styles.statusStrip, { backgroundColor: statusConfig.color }]}
        />

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.orderId, { color: STATUS_COLORS.text }]}>
                {orderId}
              </Text>
              <Badge
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: `${statusConfig.color}15`,
                    borderColor: `${statusConfig.color}30`,
                  },
                ]}
              >
                <Ionicons
                  name={statusConfig.iconName as any}
                  size={12}
                  color={statusConfig.color}
                  style={{ marginRight: 4 }}
                />
                <BadgeText
                  style={[styles.statusText, { color: statusConfig.color }]}
                >
                  {statusConfig.label}
                </BadgeText>
              </Badge>
            </View>
            <Ionicons name="chevron-forward" size={20} color={STATUS_COLORS.textSecondary} />
          </View>

          {/* Info rows */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Ionicons name="storefront-outline" size={14} color={STATUS_COLORS.textSecondary} />
              <Text
                style={[styles.infoText, { color: STATUS_COLORS.text }]}
                numberOfLines={1}
              >
                {order.vendor_name || "Unknown Vendor"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={14} color={STATUS_COLORS.textSecondary} />
              <Text
                style={[styles.infoText, { color: STATUS_COLORS.text }]}
                numberOfLines={1}
              >
                {order.customer_name || "Unknown Customer"}
              </Text>
            </View>
          </View>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              { borderTopColor: STATUS_COLORS.border + "40" },
            ]}
          >
            <View
              style={[
                styles.timeBadge,
                {
                  backgroundColor: STATUS_COLORS.surfaceSecondary,
                },
              ]}
            >
              <Ionicons name="time-outline" size={12} color={STATUS_COLORS.textSecondary} />
              <Text
                style={[
                  styles.timeText,
                  { color: STATUS_COLORS.textSecondary },
                ]}
              >
                {formatDateTime(order.order_date)}
              </Text>
            </View>

            {statusConfig.action && onPrimaryAction && (
              <Button
                size="sm"
                style={[
                  styles.primaryBtn,
                  { backgroundColor: statusConfig.color },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  onPrimaryAction();
                }}
              >
                <ButtonText style={styles.primaryBtnText}>
                  {statusConfig.action}
                </ButtonText>
              </Button>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusStrip: {
    height: 4,
    width: "100%",
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
  },
  orderId: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "SpaceMono",
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoSection: {
    gap: 8,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 36,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
