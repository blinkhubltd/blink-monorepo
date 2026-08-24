import React, { useState, useCallback } from "react";
import { ScrollView, View, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { NotificationItem } from "@/components/ui/NotificationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBox } from "@/components/ui/SkeletonBox";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useNotificationResponse } from "@/lib/hooks/useNotificationResponse";
import {
  getRoleSpecificEmptyMessage,
  getRoleSpecificFilterOptions,
} from "@/lib/notificationHelpers";
import { isRider, isPicker } from "@/lib/roles";
import { useTheme } from "@/theme/ThemeContext";

type FilterType = "all" | "unread" | "delivery" | "orders";

function NotificationsSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 12,
            padding: 14,
          }}
        >
          <SkeletonBox width={42} height={42} borderRadius={21} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBox width="70%" height={14} borderRadius={6} />
            <SkeletonBox width="100%" height={12} borderRadius={6} />
            <SkeletonBox width="90%" height={12} borderRadius={6} />
            <SkeletonBox width="40%" height={10} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    userRole,
    getFilteredNotifications,
  } = useNotifications();

  const { handleNotificationNavigation } = useNotificationResponse();

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const filterOptions = getRoleSpecificFilterOptions(userRole || "CUSTOMER");
  const filteredNotifications = getFilteredNotifications(filter);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Real refresh would call a data refetch here
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleNotificationPress = (notification: any) => {
    if (notification.data) {
      handleNotificationNavigation(notification.data);
    }
  };

  const getRoleTitle = () => {
    if (isRider(userRole)) return "Delivery Notifications";
    if (isPicker(userRole)) return "Order Notifications";
    return "Notifications";
  };

  const getRoleDescription = () => {
    if (isRider(userRole))
      return "Stay updated on your delivery assignments and order status";
    if (isPicker(userRole))
      return "Get notified about new orders and picking assignments";
    return "Stay updated with your latest notifications";
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: theme.colors.text,
            }}
          >
            {getRoleTitle()}
          </Text>
          {unreadCount > 0 && (
            <View
              style={{
                backgroundColor: theme.colors.error,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 10,
                minWidth: 24,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                {unreadCount}
              </Text>
            </View>
          )}
        </View>

        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textSecondary,
            marginBottom: 14,
          }}
        >
          {getRoleDescription()}
        </Text>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: unreadCount > 0 ? 12 : 0 }}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            {filterOptions.map((option) => {
              const isActive = filter === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => setFilter(option.id as FilterType)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 20,
                    borderWidth: 1,
                    backgroundColor: isActive
                      ? theme.colors.primary
                      : theme.colors.surface,
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{option.icon}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: isActive ? "#fff" : theme.colors.textSecondary,
                    }}
                  >
                    {option.label}
                  </Text>
                  {option.id === "unread" && unreadCount > 0 && (
                    <View
                      style={{
                        backgroundColor: isActive ? "#fff4" : theme.colors.error,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 8,
                        minWidth: 18,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? "#fff" : "#fff",
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        {unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            activeOpacity={0.8}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.primary,
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: "600",
                fontSize: 13,
              }}
            >
              Mark All as Read ({unreadCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {isLoading ? (
        <NotificationsSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: 40,
            flexGrow: 1,
          }}
        >
          {filteredNotifications.length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title={
                filter === "unread"
                  ? "No Unread Notifications"
                  : "No Notifications"
              }
              subtitle={
                filter === "unread"
                  ? "You're all caught up! Check back later for new updates."
                  : getRoleSpecificEmptyMessage(userRole || "CUSTOMER")
              }
              action={
                filter !== "all" && notifications.length > 0
                  ? {
                      label: "View All Notifications",
                      onPress: () => setFilter("all"),
                    }
                  : undefined
              }
            />
          ) : (
            filteredNotifications.map((notification: any) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                userRole={userRole}
                onRead={markAsRead}
                onPress={() => handleNotificationPress(notification)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
