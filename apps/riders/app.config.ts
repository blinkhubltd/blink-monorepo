import "dotenv/config";
import type { ExpoConfig } from "@expo/config-types";

// Central dynamic Expo configuration.
// Move all secrets / API keys to environment variables (.env, .env.local).
// Public keys (safe for client bundle): EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, EXPO_PUBLIC_CONVEX_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
// Server-only keys (NEVER exposed in extra for client): SERVER_GOOGLE_MAPS_API_KEY, CLERK_SECRET_KEY
// Add these to your .env.local file as needed.
// Example .env.local:
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_EMBED_KEY
// EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
// EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
// SERVER_GOOGLE_MAPS_API_KEY=YOUR_SERVER_RESTRICTED_KEY
// CLERK_SECRET_KEY=sk_live_xxx
// CLERK_JWT_ISSUER_DOMAIN=your-clerk-domain

const mapsPublicKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Helper to warn when missing required public keys.
function assertKey(name: string, value: string, required: boolean = true) {
  if (required && !value) {
    // eslint-disable-next-line no-console
    console.warn(`[app.config] Missing required env variable: ${name}`);
  }
  return value;
}

const expoConfig: ExpoConfig = {
  name: "Blink Rider",
  slug: "blink-rider-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/Blink-Riders-Icon-01.png",
  scheme: "blinkrider",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/icon.png",
    resizeMode: "cover",
    backgroundColor: "#000000",
  },
  ios: {
    // Was absent entirely, which means iOS builds could never be submitted.
    // Matches the Android package deliberately.
    bundleIdentifier: "com.blink.rider",
    supportsTablet: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "We use your location to show nearby orders and track deliveries.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "We use your location in the background to track active deliveries and improve assignments.",
      UIBackgroundModes: ["location"],
    },
    config: {
      googleMapsApiKey: assertKey(
        "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
        mapsPublicKey
      ),
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/Blink-Riders-Icon-02.png",
      backgroundColor: "#000000",
    },
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    edgeToEdgeEnabled: true,
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
      "android.permission.WAKE_LOCK",
      "com.google.android.c2dm.permission.RECEIVE",
    ],
    package: "com.blink.rider",
    config: {
      googleMaps: {
        apiKey: assertKey("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", mapsPublicKey),
      },
    },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-web-browser",
    "expo-location",
    "expo-task-manager",
    "expo-notifications",
    "expo-font",
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "4e29a2ba-e0ea-4d1f-ba2b-dc803e85569d",
    },
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: mapsPublicKey,
    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL || "",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || "",
    // Do NOT expose server-only secrets here.
  },
  owner: "blink-hub",
};

export default expoConfig;
