import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useAuth } from "../auth";
import { isRider, isPicker } from "@/lib/roles";

export function useNotifications() {
  const { user } = useAuth();

  const currentUser = useQuery(
    api.user.users.getCurrentUser,
    user?.id ? { clerkId: user.id } : "skip",
  );

  const notifications = useQuery(
    api.data.user_notifications.getUserNotifications,
    currentUser?._id
      ? {
          userId: currentUser._id,
          limit: 50,
        }
      : "skip",
  );

  const unreadCount = useQuery(
    api.data.user_notifications.getUnreadNotificationCount,
    currentUser?._id ? { userId: currentUser._id } : "skip",
  );

  const markAsRead = useMutation(api.data.user_notifications.markNotificationAsRead);
  const markAllAsRead = useMutation(
    api.data.user_notifications.markAllNotificationsAsRead,
  );
  const deleteNotification = useMutation(
    api.data.user_notifications.deleteNotification,
  );

  const handleMarkAsRead = async (notificationId: string) => {
    if (!currentUser?._id) return;
    try {
      await markAsRead({
        userId: currentUser._id,
        notificationId: notificationId as any,
      });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!currentUser?._id) return;
    try {
      await markAllAsRead({ userId: currentUser._id });
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteNotification({
        notificationId: notificationId as any,
        userId: currentUser?._id as any,
      });
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  // Filter notifications by role-specific types for better UX
  const getFilteredNotifications = (
    filter?: "all" | "unread" | "delivery" | "orders",
  ) => {
    if (!notifications) return [];

    let filtered = notifications;

    // Apply status filter
    if (filter === "unread") {
      filtered = filtered.filter((n: any) => n.status === "unread");
    }

    // Apply role-specific type filters
    if (filter === "delivery" && isRider(currentUser?.roleName)) {
      filtered = filtered.filter((n: any) => n.type === "delivery");
    }

    if (filter === "orders" && isPicker(currentUser?.roleName)) {
      filtered = filtered.filter((n: any) => n.type === "order_update");
    }

    return filtered;
  };

  return {
    notifications: notifications || [],
    unreadCount: unreadCount || 0,
    isLoading: notifications === undefined,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDeleteNotification,
    userRole: currentUser?.roleName,
    userId: currentUser?._id,
    getFilteredNotifications,
  };
}
