import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

export interface NotificationData {
  type: "delivery_assigned" | "order_assigned" | "status_update" | "general";
  orderId?: string;
  shipmentId?: string;
  customData?: Record<string, any>;
}

export interface PushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: NotificationData;
}

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and return the push token
 */
export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  let token: string | null = null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Failed to get push token for push notification!");
      return null;
    }

    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })
      ).data;

      console.log("Push token:", pushTokenString);
      token = pushTokenString;
    } catch (error) {
      console.error("Error getting push token:", error);
      return null;
    }
  } else {
    console.log("Must use physical device for Push Notifications");
  }

  return token;
}

/**
 * Send a push notification using Expo's Push API
 */
export async function sendPushNotification(
  message: PushMessage
): Promise<boolean> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log("Push notification sent:", result);

    return response.ok;
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}

/**
 * Send multiple push notifications at once
 */
export async function sendBatchPushNotifications(
  messages: PushMessage[]
): Promise<boolean> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log("Batch push notifications sent:", result);

    return response.ok;
  } catch (error) {
    console.error("Error sending batch push notifications:", error);
    return false;
  }
}

/**
 * Create a delivery assignment notification message
 */
export function createDeliveryAssignmentNotification(
  pushToken: string,
  orderRef: string,
  customerName: string,
  deliveryAddress: string,
  orderId: string,
  shipmentId?: string
): PushMessage {
  return {
    to: pushToken,
    sound: "default",
    title: "🚚 New Delivery Assignment!",
    body: `Order #${orderRef} for ${customerName}\nDelivery to: ${deliveryAddress}`,
    data: {
      type: "delivery_assigned",
      orderId,
      shipmentId,
      customData: {
        orderRef,
        customerName,
        deliveryAddress,
      },
    },
  };
}

/**
 * Create a picker order assignment notification message
 */
export function createOrderAssignmentNotification(
  pushToken: string,
  orderRef: string,
  customerName: string,
  itemCount: number,
  orderId: string
): PushMessage {
  return {
    to: pushToken,
    sound: "default",
    title: "📋 New Order Ready for Pickup!",
    body: `Order #${orderRef} for ${customerName}\n${itemCount} items ready to pick`,
    data: {
      type: "order_assigned",
      orderId,
      customData: {
        orderRef,
        customerName,
        itemCount,
      },
    },
  };
}

/**
 * Create a status update notification message
 */
export function createStatusUpdateNotification(
  pushToken: string,
  orderRef: string,
  newStatus: string,
  orderId: string,
  shipmentId?: string
): PushMessage {
  return {
    to: pushToken,
    sound: "default",
    title: "📬 Order Status Update",
    body: `Order #${orderRef} is now ${newStatus}`,
    data: {
      type: "status_update",
      orderId,
      shipmentId,
      customData: {
        orderRef,
        newStatus,
      },
    },
  };
}
