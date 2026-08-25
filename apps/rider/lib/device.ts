/**
 * A stable identifier for this install.
 *
 * Push tokens are keyed per device so a rider with a phone and a hub tablet
 * keeps a row for each. That needs an id that survives app restarts but is not
 * a hardware identifier — those are restricted on both platforms and would tie a
 * person to a handset across reinstalls, which is more than a notification
 * router needs.
 *
 * So: a random id, generated once and kept in SecureStore. A reinstall produces
 * a new one, and the backend disables the previous row when it sees the same
 * Expo token arrive under a new device id.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "blink.rider.deviceId";

/** In-memory cache so repeated calls in one session do not hit the keychain. */
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  try {
    const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Unreadable keychain entry. Fall through and mint a new one rather than
    // failing registration — a duplicate row is recoverable, no push is not.
  }

  const fresh = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  } catch {
    // Not persisted: this session still registers, and the next launch mints
    // another id. The backend deduplicates on the Expo token, so this degrades
    // to an extra disabled row rather than double notifications.
  }
  cached = fresh;
  return fresh;
}

/**
 * The platform in the backend's `pushPlatforms` vocabulary.
 *
 * It has exactly three values, and React Native's `Platform.OS` has more —
 * windows and macos would otherwise be sent as-is and fail arg validation.
 */
export function pushPlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}
