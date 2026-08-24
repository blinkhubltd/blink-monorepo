import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "Processing"
  | "Pickup"
  | "Delivery"
  | "Delivered";

type Props = {
  order: any;
  onPress: () => void;
};

const getStatusConfig = (status: OrderStatus) => {
  switch (status) {
    case "Pending":
      return { color: THEME.colors.warning, label: "Pending", iconName: "alert-circle-outline", bgColor: THEME.colors.warning + "15" };
    case "Confirmed":
      return { color: THEME.colors.success, label: "Ready to Pick", iconName: "play-circle-outline", bgColor: THEME.colors.success + "15" };
    case "Processing":
      return { color: THEME.colors.info, label: "In Progress", iconName: "cube-outline", bgColor: THEME.colors.info + "15" };
    case "Pickup":
      return { color: THEME.colors.primary, label: "Ready for Rider", iconName: "checkmark-circle-outline", bgColor: THEME.colors.primary + "15" };
    case "Delivery":
      return { color: "#9C27B0", label: "Out for Delivery", iconName: "car-outline", bgColor: "#9C27B015" };
    case "Delivered":
      return { color: "#4CAF50", label: "Delivered", iconName: "checkmark-circle-outline", bgColor: "#4CAF5015" };
    default:
      return { color: THEME.colors.textSecondary, label: status, iconName: "cube-outline", bgColor: THEME.colors.surfaceSecondary };
  }
};

export default function PickerOrderCardNew({ order, onPress }: Props) {
  const statusConfig = getStatusConfig(order.order_status as OrderStatus);

  const itemCount = order.items?.length || 0;
  const pickedCount = order.items?.filter((i: any) => i.is_picked).length || 0;
  const isFullyPicked = itemCount > 0 && pickedCount === itemCount;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Status Indicator Bar */}
      <View
        style={[styles.statusBar, { backgroundColor: statusConfig.color }]}
      />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.orderRef}>
              {order.reference ||
                `#${String(order._id).slice(-6).toUpperCase()}`}
            </Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: statusConfig.bgColor,
                  borderColor: statusConfig.color + "40",
                },
              ]}
            >
              <Ionicons name={statusConfig.iconName as any} size={12} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={THEME.colors.textSecondary} />
        </View>

        {/* Customer Info */}
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color={THEME.colors.textSecondary} />
          <Text style={styles.infoText}>
            {order.customer_name || "Customer"}
          </Text>
        </View>

        {/* Time Info */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color={THEME.colors.textSecondary} />
          <Text style={styles.infoText}>
            {new Date(order.order_date).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Progress Section for Confirmed/Processing orders */}
        {(order.order_status === "Confirmed" ||
          order.order_status === "Processing") && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Ionicons name="list-outline" size={14} color={THEME.colors.primary} />
              <Text style={styles.progressText}>
                {pickedCount}/{itemCount} items picked
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${(pickedCount / (itemCount || 1)) * 100}%`,
                    backgroundColor: isFullyPicked
                      ? THEME.colors.success
                      : THEME.colors.warning,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Items count for other statuses */}
        {order.order_status !== "Confirmed" &&
          order.order_status !== "Processing" && (
            <View style={styles.infoRow}>
              <Ionicons name="cube-outline" size={16} color={THEME.colors.textSecondary} />
              <Text style={styles.infoText}>{itemCount} items</Text>
            </View>
          )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusBar: {
    height: 4,
    width: "100%",
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  orderRef: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "SpaceMono",
    color: THEME.colors.text,
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
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    fontWeight: "500",
  },
  progressSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  progressBar: {
    height: 6,
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
