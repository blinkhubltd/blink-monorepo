import "dotenv/config";
import type { ExpoConfig } from "expo/config";

/**
 * Blink shop (customer app) — Expo config.
 *
 * Env contract: this app may only read EXPO_PUBLIC_* (plus CONVEX_DEPLOYMENT).
 * Anything Metro reads ships in the APK, so server secrets live in Convex env
 * vars, never here. EXPO_PUBLIC_* values are inlined by the bundler already —
 * they are deliberately NOT mirrored into `extra`, which is where the previous
 * app duplicated them for no benefit.
 *
 * ── Merged forward from the deleted app.json ──────────────────────────────
 *
 * blink-ecommerce carried BOTH an app.config.ts and an app.json. Expo prefers
 * the former, so app.json was dead — but it was the only place two things
 * existed: the `expo-notifications` plugin and the POST_NOTIFICATIONS /
 * NOTIFICATIONS Android permissions. apps/rider proves the plugin is required
 * for push to work at all, so both are carried here and app.json is not ported.
 *
 * app.json was also strictly invalid JSON (it contained a `//` comment) and
 * embedded a literal "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" that static JSON
 * never interpolates — which is why the .ts config exists in the first place.
 */

function requiredPublic(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Fail loudly at config time rather than shipping a build whose maps,
    // auth or backend silently do not work.
    throw new Error(
      `[app.config] Missing required env variable ${name}. ` +
        `Add it to apps/shop/.env.local (see .env.example).`,
    );
  }
  return value;
}

/**
 * Under EAS, every public var the app needs is required at CONFIG time.
 *
 * This is what makes the `production` profile in eas.json safe to leave empty:
 * it carries no inlined Convex URL, so if the EAS production environment is
 * missing one the build fails here rather than producing an app that either
 * crashes on launch or — worse — quietly points at the development deployment.
 *
 * Locally these stay optional, so `expo start` works from a fresh clone before
 * anyone has filled in .env.local.
 */
const isBuild = process.env.EAS_BUILD === "true";

function publicVar(name: string): string {
  return isBuild ? requiredPublic(name) : (process.env[name] ?? "");
}

const mapsApiKey = publicVar("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");

// Read for their throw-on-missing side effect under EAS. The bundler inlines
// the actual values; nothing needs the return here.
publicVar("EXPO_PUBLIC_CONVEX_URL");
publicVar("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
publicVar("EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY");

const config: ExpoConfig = {
  name: "Blink",
  slug: "blink",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "blink",
  userInterfaceStyle: "automatic",
  // No `newArchEnabled` and no `edgeToEdgeEnabled`: on Expo 57 the New
  // Architecture is the only architecture and Android edge-to-edge is the
  // default, so both flags were dropped from the config type. Carrying them
  // forward from blink-ecommerce's config is a type error, not a no-op.
  owner: "blink-hub",

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.blink.app",
    // Universal links, paired with the Android intentFilters below. Deep
    // linking to a product is an exit criterion for this app, so these are not
    // optional decoration.
    associatedDomains: ["applinks:blink.app", "applinks:www.blink.app"],
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "We use your location to show nearby vendors and deliver your orders.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Your location improves delivery accuracy and estimated times.",
    },
    config: { googleMapsApiKey: mapsApiKey },
  },

  android: {
    // No `edgeToEdgeEnabled`: Expo 57 makes edge-to-edge the default on Android
    // and dropped the flag from the config type.
    package: "com.blink.app",
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#FFC50B",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      // From the deleted app.json. Without POST_NOTIFICATIONS, Android 13+
      // silently drops every push.
      "POST_NOTIFICATIONS",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "blink.app", pathPrefix: "/product" },
          { scheme: "https", host: "www.blink.app", pathPrefix: "/product" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    config: { googleMaps: { apiKey: mapsApiKey } },
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/icon.png",
  },

  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    "expo-font",
    "expo-image",
    "expo-sharing",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-mark.png",
        resizeMode: "contain",
        backgroundColor: "#FFC50B",
        dark: { backgroundColor: "#0A0E16" },
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "We use your location to show shops that deliver to you.",
      },
    ],
    // Merged forward from app.json — the only place this existed.
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#FFC50B",
      },
    ],
    "expo-image-picker",
    "expo-document-picker",
  ],

  experiments: { typedRoutes: true },

  extra: {
    router: {},
    eas: { projectId: "b4f7f8b0-be6d-4af2-baa7-ae003f635427" },
  },
};

export default config;
