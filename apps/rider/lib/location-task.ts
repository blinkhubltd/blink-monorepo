/**
 * Background location reporting.
 *
 * ── Why this file looks like this ─────────────────────────────────────────
 *
 * The task runs OUTSIDE React. The OS can wake the process with no component
 * mounted — after a swipe-away, or hours into a shift — so nothing here may use
 * a hook, a provider, or `useMutation`. It has to build its own authenticated
 * client each time it fires.
 *
 * `TaskManager.defineTask` is called at module scope for the same reason: the
 * definition must exist before the OS looks for it, which is earlier than any
 * render. This module is imported for its side effect from the root layout.
 *
 * It reports through `data.riders.reportMyLocation`, which derives the rider from
 * the caller. The alternative — the `webhooks/location` HTTP endpoint — needs
 * `LOCATION_INGEST_API_KEY`, a SERVER secret, and accepts a `riderId` in the
 * body. Putting that key in an APK would hand anyone who unzips it the ability
 * to move any rider on the map.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getClerkInstance } from "@clerk/clerk-expo";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@repo/backend";

export const LOCATION_TASK = "blink-rider-location";

/**
 * Reporting cadence.
 *
 * A delivery rider moving through traffic does not need second-by-second
 * accuracy — the customer-facing question is "roughly where is my order", and
 * every fix is a wake-up, a network round trip and a slice of battery. 25s or
 * 60m, whichever comes first, keeps the dot honest on a moving bike while a
 * rider stopped at a hub reports almost nothing.
 */
const INTERVAL_MS = 25_000;
const DISTANCE_M = 60;

/** Reject a fix this far out of date rather than reporting a stale position. */
const MAX_FIX_AGE_MS = 5 * 60 * 1000;

function convexUrl(): string | null {
  return process.env.EXPO_PUBLIC_CONVEX_URL ?? null;
}

/**
 * An authenticated Convex client, built fresh per invocation.
 *
 * Not cached: the process may have been restarted since the last fix, and a
 * cached client would hold a token that expired hours ago.
 */
async function authedClient(): Promise<ConvexHttpClient | null> {
  const url = convexUrl();
  if (!url) return null;

  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return null;

  // getClerkInstance throws if Clerk was never initialised and no key is given,
  // which is exactly the cold-wake case, so the key is always passed.
  const clerk = getClerkInstance({ publishableKey });
  const token = await clerk.session?.getToken({ template: "convex" });
  if (!token) return null;

  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return client;
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[location] task error", error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | null)
    ?.locations;
  if (!locations || locations.length === 0) return;

  // The newest fix only. The backend stores one position per rider, so sending a
  // whole batch would be several writes that each overwrite the last — and the
  // final state is the same as sending just the newest.
  const newest = locations.reduce((a, b) =>
    a.timestamp >= b.timestamp ? a : b,
  );

  // A queued batch delivered after a tunnel can be minutes old. reportMyLocation
  // rejects a fix older than the stored one, but discarding an obviously stale
  // batch here saves the round trip.
  if (Date.now() - newest.timestamp > MAX_FIX_AGE_MS) return;

  try {
    const client = await authedClient();
    // No session means the rider signed out while the task was still registered.
    // Stopping is the right response: continuing would retry forever.
    if (!client) {
      await stopLocationReporting();
      return;
    }

    await client.mutation(api.data.riders.reportMyLocation, {
      lat: newest.coords.latitude,
      lng: newest.coords.longitude,
      recordedAt: newest.timestamp,
    });
  } catch (err) {
    // Swallowed on purpose. A thrown error in a background task is reported to
    // the OS, which can back off or stop delivering updates — losing one fix is
    // better than losing the rest of the shift.
    console.warn("[location] report failed", err);
  }
});

export type LocationStartResult =
  | { started: true }
  | { started: false; reason: "foreground_denied" | "background_denied" | "unavailable" };

/**
 * Starts reporting, asking for whatever permission is still missing.
 *
 * Foreground has to be granted before background can even be requested — asking
 * for "always" first is rejected outright on both platforms.
 */
export async function startLocationReporting(): Promise<LocationStartResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return { started: false, reason: "foreground_denied" };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    return { started: false, reason: "background_denied" };
  }

  if (await isLocationReporting()) return { started: true };

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: INTERVAL_MS,
      distanceInterval: DISTANCE_M,
      // Batches fixes so the process is woken less often. iOS honours these as
      // hints; Android applies them directly.
      deferredUpdatesInterval: INTERVAL_MS,
      deferredUpdatesDistance: DISTANCE_M,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android requires a visible foreground service for background location,
      // and the wording is what a rider sees in their shade all shift. It says
      // why it is running and that it stops when they go offline.
      foregroundService: {
        notificationTitle: "Blink is sharing your location",
        notificationBody: "Your hub can see you while you are online.",
        notificationColor: "#FFC50B",
      },
    });
    return { started: true };
  } catch (err) {
    console.warn("[location] could not start updates", err);
    return { started: false, reason: "unavailable" };
  }
}

export async function stopLocationReporting(): Promise<void> {
  try {
    if (await isLocationReporting()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (err) {
    console.warn("[location] could not stop updates", err);
  }
}

/**
 * Whether the task is currently registered.
 *
 * Checked rather than tracked in memory: registration outlives the process, so a
 * relaunch would otherwise start a second set of updates on top of one already
 * running.
 */
export async function isLocationReporting(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
