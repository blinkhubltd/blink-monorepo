import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { useCrew } from "./CrewProvider";
import { getDeviceId, pushPlatform } from "../lib/device";
import { resolveNotificationTarget } from "../lib/notification-route";

/**
 * How a notification behaves while the app is open.
 *
 * Set at module scope because expo-notifications reads it when a notification
 * arrives, which can be before any component has mounted.
 *
 * Alerts are shown even in the foreground: a rider with the app open on the
 * deliveries list still needs to be told a new one was assigned, and swallowing
 * it because the app happens to be visible is how assignments get missed.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushState =
  | "idle"
  | "unsupported"
  | "denied"
  | "registered"
  | "error";

/**
 * Registers this device for push and routes taps.
 *
 * Deliberately silent about failure. Push is not a feature a rider invokes — it
 * either works or it does not, and an error dialog on launch for something they
 * cannot fix is noise. The state is exposed so Profile could surface it, and the
 * reason is logged.
 */
export function PushProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { crew, userId, gate } = useCrew();
  const [state, setState] = useState<PushState>("idle");

  const register = useMutation(api.data.push_tokens.registerMyPushToken);
  // Registration is attempted once per signed-in user, not on every render that
  // touches the crew document.
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    // Only once the crew member is actually allowed in. Registering during
    // "not_crew" would attach a token to an account that cannot receive work.
    if (gate !== "ok" || !userId) return;
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;

    void (async () => {
      try {
        if (!Device.isDevice) {
          // Simulators cannot receive remote push. Stating it beats a silent
          // no-op that looks like a broken backend.
          setState("unsupported");
          return;
        }

        // Android needs a channel before a notification can display, and the
        // importance set here is what allows a heads-up banner.
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("assignments", {
            name: "Order assignments",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FFC50B",
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const asked = await Notifications.requestPermissionsAsync();
          status = asked.status;
        }
        if (status !== "granted") {
          setState("denied");
          return;
        }

        // projectId is required for an Expo push token on a bare/EAS build and
        // is not inferable at runtime — reading it from the resolved config
        // rather than hardcoding keeps it correct across dev and production.
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        if (!projectId) {
          console.warn("[push] no EAS projectId; cannot mint a push token");
          setState("error");
          return;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        await register({
          token: token.data,
          platform: pushPlatform(),
          deviceId: await getDeviceId(),
        });
        setState("registered");
      } catch (err) {
        // A failed registration must not take the app down on launch.
        console.warn("[push] registration failed", err);
        setState("error");
        registeredFor.current = null;
      }
    })();
  }, [gate, userId, register]);

  const openTarget = useCallback(
    (data: unknown) => {
      const target = resolveNotificationTarget(data, crew?.role ?? "rider");
      // Typed routes cannot express a runtime-resolved path, so this is the one
      // place a cast is warranted — the value is checked against an allowlist in
      // resolveNotificationTarget rather than taken from the payload.
      router.push({
        pathname: target.route as never,
        params: target.params as never,
      });
    },
    [router, crew?.role],
  );

  // A tap that launched the app from cold arrives here rather than through the
  // listener, which is not yet attached at that point.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && last) {
        openTarget(last.notification.request.content.data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openTarget]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        openTarget(response.notification.request.content.data);
      },
    );
    return () => sub.remove();
  }, [openTarget]);

  return <>{children}</>;
}
