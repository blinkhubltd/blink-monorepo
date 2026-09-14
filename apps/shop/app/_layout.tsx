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
import Ionicons from "@expo/vector-icons/Ionicons";
/**
 * Per-face subpaths, NOT the package barrel.
 *
 * `@expo-google-fonts/inter`'s index re-exports all 18 faces with a top-level
 * `require` of each `.ttf`, so Metro follows every one and a barrel import ships
 * ~6.2MB of fonts to use four of them. Verified with `expo export`: the barrel
 * bundled all 18, these four subpaths bundle exactly four (~1.34MB).
 *
 * Rubik had the same problem before this change, shipping all 14 of its faces
 * (~2.9MB), so the switch is a net reduction of roughly 1.5MB rather than the
 * increase the raw per-face sizes suggest.
 */
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";

import { ConvexClerkProvider } from "../providers/ConvexClerkProvider";
import { LocationProvider } from "../providers/LocationProvider";
import { CartProvider } from "../providers/CartProvider";
import {
  PAYSTACK_CHANNELS,
  PAYSTACK_CURRENCY,
  PAYSTACK_PUBLIC_KEY,
} from "../lib/paystack-config";
import { useInstallAttribution } from "../lib/use-install-attribution";

/**
 * Renders nothing. Exists only because `useInstallAttribution` needs
 * `useAuth()`, which needs to be inside `ConvexClerkProvider` — and a hook
 * cannot be called directly in `RootLayout`'s body above where that provider
 * wraps its children.
 */
function InstallAttribution() {
  useInstallAttribution();
  return null;
}

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
  // Four faces, matching the four fontFamily slots in tailwind.config.js —
  // `font-black` resolves to Bold and there is no italic slot. Adding a face
  // here that no slot names, or naming a slot with no face loaded here, both
  // fail silently: the text renders in the system font.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // The glyph font behind every `components/icon.tsx`. @expo/vector-icons
    // loads its own fonts lazily, which would otherwise leave a window after
    // the splash hides where every icon in the app is a blank box. Gating the
    // splash on it too costs one line.
    ...Ionicons.font,
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
                <InstallAttribution />
                {/*
              headerShown off for the whole app; screens render their own
              headers. The catalogue's collapsing headers cannot be expressed as
              native header options, and leaving the native one on as well gives
              two stacked headers on every detail screen.
            */}
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="product/[productId]" />
                  {/*
                    Search is a pushed route rather than a tab, matching the app
                    this replaces, which reached it from a control in the
                    catalogue header. The URL is unchanged at `/search`.
                  */}
                  <Stack.Screen name="search" />
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
