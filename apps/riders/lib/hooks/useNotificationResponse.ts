import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useNotifications } from "./useNotifications";
import { isRider, isPicker } from "@/lib/roles";

export function useNotificationResponse() {
  const router = useRouter();
  const { markAsRead, userRole } = useNotifications();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data;

        // Mark as read if notification ID is provided
        if (data?.notificationId && typeof data.notificationId === "string") {
          try {
            await markAsRead(data.notificationId);
          } catch (error) {
            console.warn("Failed to mark notification as read:", error);
          }
        }

        // Handle navigation based on notification type and role
        if (data?.route && typeof data.route === "string") {
          router.push(data.route as any);
        } else if (data?.type) {
          handleNotificationNavigation(data);
        }
      },
    );

    return () => subscription.remove();
  }, [router, markAsRead]);

  const handleNotificationNavigation = (data: any) => {
    console.log(`[${userRole}] Handling notification navigation:`, data);

    switch (data.type) {
      // Rider-specific navigation
      case "delivery_assigned":
        if (isRider(userRole)) {
          // Navigate to shipments/deliveries screen
          router.push("/(tabs)/deliveries");
        }
        break;

      case "order_ready":
        if (isRider(userRole)) {
          // Navigate to ready orders or shipments
          router.push("/(tabs)/deliveries");
        }
        break;

      // Picker-specific navigation
      case "order_assigned":
        if (isPicker(userRole)) {
          // Navigate to orders screen
          router.push("/(picker-tabs)/orders");
        }
        break;

      // Common navigation
      case "status_update":
        if (data.orderId) {
          // Navigate to order details based on role
          if (isRider(userRole)) {
            router.push(`/delivery-details?orderId=${data.orderId}` as any);
          } else if (isPicker(userRole)) {
            router.push(`/picker-order-details?orderId=${data.orderId}` as any);
          } else {
            router.push(`/order-details/${data.orderId}` as any);
          }
        } else {
          // Default to notifications screen
          router.push("/notifications" as any);
        }
        break;

      case "order_update":
        if (data.orderId) {
          if (isPicker(userRole)) {
            router.push(`/picker-order-details?orderId=${data.orderId}` as any);
          } else {
            router.push(`/order-details/${data.orderId}` as any);
          }
        } else {
          router.push("/notifications" as any);
        }
        break;

      case "delivery":
        if (isRider(userRole)) {
          router.push("/(tabs)/deliveries" as any);
        } else {
          router.push("/notifications" as any);
        }
        break;

      case "promotion":
        // Navigate to home/shopping screen
        router.push("/" as any);
        break;

      case "system":
        // Navigate to notifications or profile
        router.push("/notifications" as any);
        break;

      default:
        console.log(`Unknown notification type: ${data.type}`);
        router.push("/notifications" as any);
    }
  };

  return {
    handleNotificationNavigation,
  };
}
