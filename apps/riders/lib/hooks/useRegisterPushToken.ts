import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  useNotificationsPermissions,
  getExpoPushTokenSafe,
} from "./useNotificationsPermissions";
import { useAuth } from "@/lib/auth";

// Configure notification handler for foreground notifications
// Enable sound for riders/pickers as they need immediate alerts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true, // Enable sound for riders/pickers
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useRegisterPushToken() {
  const { user, isAuthenticated } = useAuth();
  const registerPushToken = useMutation(api.data.push_tokens.registerPushToken);
  const deregisterPushToken = useMutation(api.data.push_tokens.deregisterPushToken);
  const currentTokenRef = useRef<string | null>(null);
  const { status } = useNotificationsPermissions({ request: true });

  const currentUser = useQuery(
    api.user.users.getCurrentUser,
    user?.id ? { clerkId: user.id } : "skip"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthenticated || !user) return;
      if (!Device.isDevice) return;
      if (status !== Notifications.PermissionStatus.GRANTED) return;
      if (!currentUser?._id) return;

      const token = await getExpoPushTokenSafe();
      if (!token || cancelled) return;
      if (currentTokenRef.current === token) return;
      try {
        await registerPushToken({
          userId: currentUser._id,
          token,
          platform: Device.osName === "Android" ? "android" : "ios",
        });
        currentTokenRef.current = token;
        console.log(`[${currentUser.role}] Push token registered successfully`);
      } catch (e) {
        console.warn("Failed to register push token", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, status, currentUser?._id, registerPushToken]);

  useEffect(() => {
    if (!isAuthenticated && currentTokenRef.current) {
      (async () => {
        try {
          await deregisterPushToken({ token: currentTokenRef.current! });
        } catch (e) {
          console.warn("Failed to deregister push token", e);
        } finally {
          currentTokenRef.current = null;
        }
      })();
    }
  }, [isAuthenticated, deregisterPushToken]);
}
