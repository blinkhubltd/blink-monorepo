import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";
import {
  getRoleSpecificNotificationIcon,
  getRoleSpecificNotificationColor,
  formatNotificationTime,
  getNotificationPriority,
} from "@/lib/notificationHelpers";

interface NotificationItemProps {
  notification: {
    _id: string;
    title: string;
    message: string;
    type: string;
    status: "read" | "unread";
    created_at: number;
    data?: any;
  };
  userRole?: string;
  onRead: (notificationId: string) => void;
  onPress?: () => void;
}

export function NotificationItem({
  notification,
  userRole = "CUSTOMER",
  onRead,
  onPress,
}: NotificationItemProps) {
  const theme = useTheme();
  const icon = getRoleSpecificNotificationIcon(notification.type, userRole);
  const color = getRoleSpecificNotificationColor(notification.type, userRole);
  const priority = getNotificationPriority(notification.type, userRole);
  const timeAgo = formatNotificationTime(notification.created_at);
  const isUnread = notification.status === "unread";

  const handlePress = () => {
    if (isUnread) onRead(notification._id);
    onPress?.();
  };

  const roleLabel =
    userRole === "RIDER"
      ? "Delivery"
      : userRole === "PICKER"
        ? "Picking"
        : "General";

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isUnread ? color + "30" : theme.colors.border,
        backgroundColor: isUnread ? color + "08" : theme.colors.surface,
        padding: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {/* Icon circle */}
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: color + "20",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 2,
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: isUnread ? theme.colors.text : theme.colors.textSecondary,
                flex: 1,
                marginRight: 8,
              }}
            >
              {notification.title}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {priority === "high" && (
                <View
                  style={{
                    backgroundColor: theme.colors.error,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                    High
                  </Text>
                </View>
              )}
              {isUnread && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: color,
                  }}
                />
              )}
            </View>
          </View>

          <Text
            numberOfLines={3}
            style={{
              fontSize: 13,
              color: isUnread ? theme.colors.text : theme.colors.textSecondary,
              lineHeight: 18,
            }}
          >
            {notification.message}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
              {timeAgo}
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: color + "50",
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text style={{ fontSize: 10, color, fontWeight: "600" }}>
                {roleLabel}
              </Text>
            </View>
          </View>

          {notification.data?.orderRef && (
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.textSecondary,
                marginTop: 2,
              }}
            >
              Order: {notification.data.orderRef}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
