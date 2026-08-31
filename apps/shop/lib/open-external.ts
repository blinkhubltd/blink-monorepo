import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Open a web URL.
 *
 * In-app browser first, because a legal document opened in Chrome loses the way
 * back — the customer has to task-switch, and on Android the app may be
 * reclaimed while they read. `openBrowserAsync` returns them to the exact screen
 * they left, which for a link read mid-checkout is the difference between
 * reading the terms and abandoning the basket.
 *
 * Falls through to the system browser rather than failing: `openBrowserAsync`
 * rejects when no custom-tabs provider is installed, which is a real Android
 * configuration and not one worth showing an error for.
 *
 * Returns false only when neither route worked, so the caller can say something
 * instead of appearing to do nothing.
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}
