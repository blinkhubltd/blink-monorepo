import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

type Props = {
  delivery: any;
  statusColor: string;
  StatusIcon: any;
  nextStatus: string | null;
  onPrimaryPress: () => void;
  onDetailsPress: () => void;
  STATUS_COLORS: Record<string, string>;
};

export default function DeliveryCard({
  delivery,
  statusColor,
  StatusIcon,
  nextStatus,
  onPrimaryPress,
  onDetailsPress,
  STATUS_COLORS,
}: Props) {
  const orderId = delivery.order_ref
    ? delivery.order_ref.slice(-6).toUpperCase()
    : `#${String(delivery.order_id).slice(-6).toUpperCase()}`;

  const isClearance = delivery.is_clearance === true;

  return (
    <TouchableOpacity onPress={onDetailsPress} activeOpacity={0.7}>
      <View
        style={[
          styles.card,
          { borderColor: STATUS_COLORS.border },
          isClearance && styles.clearanceCard,
        ]}
      >
        {/* Status strip */}
        <View
          style={[
            styles.statusStrip,
            { backgroundColor: statusColor },
            isClearance && styles.clearanceStrip,
          ]}
        />

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.orderId, { color: STATUS_COLORS.text }]}>
                {orderId}
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Badge
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: `${statusColor}15`,
                      borderColor: `${statusColor}40`,
                    },
                  ]}
                >
                  <StatusIcon />
                  <BadgeText
                    style={[styles.statusText, { color: statusColor }]}
                  >
                    {delivery.status}
                  </BadgeText>
                </Badge>
                {isClearance && (
                  <View style={styles.clearanceBadge}>
                    <Ionicons name="pricetag-outline" size={10} color="#FFFFFF" />
                    <Text style={styles.clearanceBadgeText}>CLEARANCE</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={STATUS_COLORS.textSecondary} />
          </View>

          {/* Route info */}
          <View style={styles.routeContainer}>
            {/* Pickup */}
            <View style={styles.routeRow}>
              <View
                style={[
                  styles.routeDot,
                  { backgroundColor: THEME.colors.success },
                ]}
              />
              <View style={styles.routeTextContainer}>
                <Text
                  style={[
                    styles.routeLabel,
                    { color: STATUS_COLORS.textSecondary },
                  ]}
                >
                  Pickup
                </Text>
                <Text
                  style={[styles.routeAddress, { color: STATUS_COLORS.text }]}
                  numberOfLines={1}
                >
                  {delivery.pickup_address?.address_1 ||
                    "Address not available"}
                  {delivery.pickup_address?.city &&
                    `, ${delivery.pickup_address.city}`}
                </Text>
              </View>
            </View>

            {/* Connector line */}
            <View style={styles.routeConnector}>
              <View
                style={[
                  styles.routeLine,
                  { backgroundColor: STATUS_COLORS.border },
                ]}
              />
            </View>

            {/* Delivery */}
            <View style={styles.routeRow}>
              <View
                style={[
                  styles.routeDot,
                  { backgroundColor: THEME.colors.primary },
                ]}
              />
              <View style={styles.routeTextContainer}>
                <Text
                  style={[
                    styles.routeLabel,
                    { color: STATUS_COLORS.textSecondary },
                  ]}
                >
                  {delivery.customer_name
                    ? `Deliver to ${delivery.customer_name}`
                    : "Delivery"}
                </Text>
                <Text
                  style={[styles.routeAddress, { color: STATUS_COLORS.text }]}
                  numberOfLines={1}
                >
                  {delivery.delivery_address?.address_1 ||
                    "Address not available"}
                  {delivery.delivery_address?.city &&
                    `, ${delivery.delivery_address.city}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer: payment + actions */}
          <View
            style={[
              styles.footer,
              { borderTopColor: STATUS_COLORS.border + "40" },
            ]}
          >
            {delivery.payment_method && (
              <View
                style={[
                  styles.paymentBadge,
                  {
                    backgroundColor: `${STATUS_COLORS.surfaceSecondary}80`,
                    borderColor: `${STATUS_COLORS.border}30`,
                  },
                ]}
              >
                <Ionicons name="card-outline" size={12} color={STATUS_COLORS.textSecondary} />
                <Text
                  style={[
                    styles.paymentText,
                    { color: STATUS_COLORS.textSecondary },
                  ]}
                >
                  {delivery.payment_method}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              {nextStatus && delivery.status !== "Delivered" && (
                <Button
                  size="sm"
                  style={[styles.primaryBtn, { backgroundColor: statusColor }]}
                  onPress={onPrimaryPress}
                >
                  <ButtonText style={styles.primaryBtnText}>
                    Continue
                  </ButtonText>
                </Button>
              )}
            </View>
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
    fontSize: 12,
    fontWeight: "600",
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
  routeContainer: {
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  routeTextContainer: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  routeConnector: {
    paddingLeft: 4,
    paddingVertical: 2,
  },
  routeLine: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 36,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  clearanceCard: {
    borderColor: "#5C6BC0",
    borderWidth: 2,
    backgroundColor: "#F3F4FD",
  },
  clearanceStrip: {
    backgroundColor: "#5C6BC0",
    height: 5,
  },
  clearanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#5C6BC0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clearanceBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
