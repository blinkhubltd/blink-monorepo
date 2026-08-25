import "dotenv/config";
import type { ExpoConfig } from "expo/config";

/**
 * Blink Rider — Expo config.
 *
 * Env contract: this app may only read EXPO_PUBLIC_* (plus CONVEX_DEPLOYMENT).
 * Anything Metro reads ships in the APK, so server secrets live in Convex env
 * vars, never here. EXPO_PUBLIC_* values are inlined by the bundler already —
 * they are deliberately NOT mirrored into `extra`, which is where the previous
 * app duplicated them for no benefit.
 */

function requiredPublic(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Fail loudly at config time rather than shipping a build whose maps,
    // auth or backend silently do not work.
    throw new Error(
      `[app.config] Missing required env variable ${name}. ` +
        `Add it to apps/rider/.env.local (see .env.example).`,
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

if (isBuild) {
  // Read for their side effect: both are consumed at runtime rather than here,
  // and a build that ships without them is a build nobody can sign into.
  requiredPublic("EXPO_PUBLIC_CONVEX_URL");
  requiredPublic("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
}

const expoConfig: ExpoConfig = {
  name: "Blink Rider",
  slug: "blink-rider-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Identity fix: was "starterkitexpo". Clerk's allowed redirect URLs must
  // include blinkrider:// before this ships.
  scheme: "blinkrider",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: false,
    // Was absent entirely, which meant no iOS build was possible.
    bundleIdentifier: "com.blink.rider",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Blink uses your location to show nearby orders and track deliveries.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Blink uses your location in the background to track active deliveries and improve assignments.",
      // Overridden by the expo-camera plugin above; kept so a bare-workflow
      // build (no plugins) still carries a usage string rather than crashing on
      // first camera access.
      NSCameraUsageDescription:
        "Blink uses the camera to scan barcodes while you pick an order, and to capture proof of delivery.",
      NSPhotoLibraryUsageDescription:
        "Blink needs photo access to attach prescription images to an order.",
      UIBackgroundModes: ["location", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
    config: {
      googleMapsApiKey: mapsApiKey,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#FFC50B",
    },
    // Identity fix: was "com.anonymous.blinkrider". This needs a new Play
    // listing and forces a reinstall — an accepted, decided trade.
    package: "com.blink.rider",
    // The previous config listed each permission twice, once bare and once
    // with the android.permission. prefix. Deduplicated.
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
      "CAMERA",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
      "WAKE_LOCK",
    ],
    config: {
      googleMaps: { apiKey: mapsApiKey },
    },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
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
        image: "./assets/images/splash-icon.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#FFC50B",
        dark: { backgroundColor: "#0A0E16" },
      },
    ],
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationAlwaysAndWhenInUsePermission:
          "Blink uses your location in the background to track active deliveries.",
      },
    ],
    "expo-task-manager",
    [
      "expo-notifications",
      {
        icon: "./assets/images/adaptive-icon.png",
        color: "#FFC50B",
      },
    ],
    [
      "expo-camera",
      {
        // Covers BOTH camera uses on purpose. expo-camera and expo-image-picker
        // each write NSCameraUsageDescription, and the last plugin to run wins —
        // introspecting the resolved config shows this string is the one that
        // ships, so a barcode-only wording would understate what the app does
        // and the infoPlist entry below never reaches the build.
        cameraPermission:
          "Blink uses the camera to scan barcodes while you pick an order, and to capture proof of delivery.",
        // The scanner never records audio, and asking for the microphone
        // alongside the camera makes a barcode reader look like a recorder.
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Blink needs photo access to attach prescription images to an order.",
        cameraPermission:
          "Blink uses the camera to capture proof of delivery.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "4e29a2ba-e0ea-4d1f-ba2b-dc803e85569d",
    },
  },
  owner: "blink-hub",
};

export default expoConfig;
