import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import { useColorScheme } from "nativewind";
import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_700Bold_Italic,
  Rubik_800ExtraBold,
} from "@expo-google-fonts/rubik";

import { ConvexClerkProvider } from "../providers/ConvexClerkProvider";
import { CrewProvider } from "../providers/CrewProvider";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or called twice under Fast Refresh. Not fatal.
});

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_800ExtraBold,
    Rubik_700Bold_Italic,
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
          </CrewProvider>
        </ConvexClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
