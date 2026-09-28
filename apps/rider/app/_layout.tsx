import "../global.css";
// Imported for its side effect: TaskManager.defineTask must run before the OS
// can invoke the background location task, which is earlier than any render.
import "../lib/location-task";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import { useColorScheme } from "nativewind";
import Ionicons from "@expo/vector-icons/Ionicons";
/**
 * Inter, the same five faces as apps/shop — the shared Tailwind preset in
 * packages/mobile-ui/theme names these families for both apps, so each app has
 * to load exactly these or its text silently falls back to the system font.
 *
 * Per-face subpaths, NOT the package barrel: `@expo-google-fonts/inter`'s index
 * `require`s all 18 faces, so a barrel import ships ~6.2MB of fonts to use
 * five. The Rubik barrel this replaces had the same problem, at ~2.9MB.
 */
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
// The one italic, for the delivery badge's forward lean — a real face rather
// than a synthesised slant, which shears the glyphs instead of redrawing them.
import { Inter_700Bold_Italic } from "@expo-google-fonts/inter/700Bold_Italic";

import { ConvexClerkProvider } from "../providers/ConvexClerkProvider";
import { CrewProvider } from "../providers/CrewProvider";
import { LocationProvider } from "../providers/LocationProvider";
import { PushProvider } from "../providers/PushProvider";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or called twice under Fast Refresh. Not fatal.
});

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
    // The glyph font behind every shared `Icon`. @expo/vector-icons loads its
    // own fonts lazily, which would otherwise leave a window after the splash
    // hides where every icon in the app is a blank box.
    ...Ionicons.font,
  });

  useEffect(() => {
    // Hide on error too. The reference app gated only on success, so a font
    // that failed to fetch left the splash up forever.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConvexClerkProvider>
          <CrewProvider>
            <PushProvider>
              <LocationProvider>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          {/*
            headerShown is off for the whole app. Pushed screens render their own
            <ScreenHeader>; leaving the native header on as well is what gave the
            reference app two stacked headers on every detail screen.
          */}
          <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
            <Stack.Screen name="index" options={{ animation: "fade" }} />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <PortalHost />
              </LocationProvider>
            </PushProvider>
          </CrewProvider>
        </ConvexClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
