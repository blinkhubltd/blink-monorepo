import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

type Props = {
  order: any;
  statusColor: string;
  statusIconName: string;
  onPrimaryPress?: () => void;
  onDetailsPress: () => void;
  STATUS_COLORS: Record<string, string>;
  primaryCtaLabel?: string;
};

export default function OrderCard({
  order,
  statusColor,
  statusIconName,
  onPrimaryPress,
  onDetailsPress,
  STATUS_COLORS,
  primaryCtaLabel = "Start Picking",
}: Props) {
  const orderId = order.reference
    ? order.reference
    : `#${String(order._id).slice(-6).toUpperCase()}`;

  return (
    <TouchableOpacity onPress={onDetailsPress} activeOpacity={0.7}>
      <View style={[styles.card, { borderColor: STATUS_COLORS.border }]}>
        {/* Status strip */}
        <View style={[styles.statusStrip, { backgroundColor: statusColor }]} />

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
                    backgroundColor: `${statusColor}15`,
                    borderColor: `${statusColor}40`,
                  },
                ]}
              >
                <Ionicons
                  name={statusIconName as any}
                  size={12}
                  color={statusColor}
                  style={{ marginRight: 4 }}
                />
                <BadgeText style={[styles.statusText, { color: statusColor }]}>
                  {order.order_status}
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
                {order.vendor_name || "Vendor not available"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={14} color={STATUS_COLORS.textSecondary} />
              <Text
                style={[styles.infoText, { color: STATUS_COLORS.text }]}
                numberOfLines={1}
              >
                {order.customer_name || "Customer"}
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
                styles.dueBadge,
                {
                  backgroundColor: `${STATUS_COLORS.surfaceSecondary}80`,
                  borderColor: `${STATUS_COLORS.border}30`,
                },
              ]}
            >
              <Ionicons name="time-outline" size={12} color={STATUS_COLORS.textSecondary} />
              <Text
                style={[styles.dueText, { color: STATUS_COLORS.textSecondary }]}
              >
                {new Date(order.order_date).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </Text>
            </View>

            {onPrimaryPress && (
              <Button
                size="sm"
                style={[styles.primaryBtn, { backgroundColor: statusColor }]}
                onPress={onPrimaryPress}
              >
                <ButtonText style={styles.primaryBtnText}>
                  {primaryCtaLabel}
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
  dueBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  dueText: {
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
