import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import { PaystackProvider } from "react-native-paystack-webview";
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
import { LocationProvider } from "../providers/LocationProvider";
import { CartProvider } from "../providers/CartProvider";
import {
  PAYSTACK_CHANNELS,
  PAYSTACK_CURRENCY,
  PAYSTACK_PUBLIC_KEY,
} from "../lib/paystack-config";

/**
 * ── The navigator is mounted unconditionally. This is the refresh fix. ─────
 *
 * blink-ecommerce's root layout did this:
 *
 *     const [appReady, setAppReady] = useState(false);
 *     useEffect(() => {
 *       if (loaded) setTimeout(() => { setAppReady(true); ... }, 2000);
 *     }, [loaded]);
 *     if (!appReady) return <CustomSplashScreen />;   // <- no <Stack> mounted
 *
 * For two seconds after every launch and every reload there was no navigator
 * at all, so Expo Router had nothing to hand the current URL to. When the Stack
 * finally mounted it started at its initial route, and the user landed on the
 * home screen no matter what they had refreshed. That is the reported bug.
 *
 * So: no early `return` of anything other than the tree. The native splash
 * (configured in app.config.ts) covers the first frames, and `hideAsync` is
 * called once fonts resolve. A brand splash, if one is wanted, belongs in a
 * route as an overlay — rendered *by* the navigator, never *instead of* it.
 *
 * Note this is stricter than apps/rider, which returns `null` until fonts load.
 * `null` is also "no navigator": it works there because rider always opens on
 * its own index screen, but it would reintroduce the bug here, where any route
 * can be the entry point via a deep link or a web reload.
 */
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
    // Hide on error too. Gating only on success leaves the splash up forever
    // when a font fails to fetch — and text renders in the fallback face, so
    // the app is perfectly usable underneath it.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConvexClerkProvider>
          <LocationProvider>
            <CartProvider>
              {/*
                Mounted unconditionally, even with no publishable key.

                `usePaystack()` throws without a provider above it, and a hook
                that throws on some renders and not others changes the hook
                count between renders — which unmounts the tree rather than
                degrading. The old app's component wrapped that call in a
                try/catch IIFE, which is precisely that bug.

                A missing key is handled where it belongs instead: the
                checkout screens do not offer pay-now at all. See
                `lib/paystack-config.ts`.
              */}
              <PaystackProvider
                publicKey={PAYSTACK_PUBLIC_KEY}
                currency={PAYSTACK_CURRENCY}
                defaultChannels={[...PAYSTACK_CHANNELS]}
              >
                <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
                {/*
              headerShown off for the whole app; screens render their own
              headers. The catalogue's collapsing headers cannot be expressed as
              native header options, and leaving the native one on as well gives
              two stacked headers on every detail screen.
            */}
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="product/[productId]" />
                  <Stack.Screen name="cart" />
                  <Stack.Screen name="checkout" />
                  <Stack.Screen name="order/[orderId]" />
                  {/*
                Auth is a MODAL over whatever route you are on, never a
                redirect to an auth route. Two reasons: the URL does not change,
                so signing in mid-checkout cannot lose your place on a reload;
                and it means no route in this app has "send unauthenticated
                users elsewhere" as its job, which is what removes two of the
                eight refresh-to-home causes rather than patching them.
              */}
                  <Stack.Screen
                    name="(auth)"
                    options={{
                      presentation: "modal",
                      animation: "slide_from_bottom",
                    }}
                  />
                </Stack>
                {/*
              Sheets and dialogs render through here. There is no
              @gorhom/bottom-sheet in this monorepo — the pattern is
              @rn-primitives/dialog over this host, which is what rider ships.
            */}
                <PortalHost />
              </PaystackProvider>
            </CartProvider>
          </LocationProvider>
        </ConvexClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
