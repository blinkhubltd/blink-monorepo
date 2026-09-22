import "../global.css";
// Side effect only: teaches NativeWind about FlashList, whose
// `contentContainerClassName` is otherwise dropped on the floor. Must run
// before any screen renders, which is why it is here and not in a screen.
import "../lib/flashlist-interop";

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
 * ~6.2MB of fonts to use five of them. Verified with `expo export`: the barrel
 * bundled all 18, these subpaths bundle exactly what is listed (~1.68MB).
 *
 * Rubik had the same problem before this change, shipping all 14 of its faces
 * (~2.9MB), so the switch is a net reduction of roughly 1.5MB rather than the
 * increase the raw per-face sizes suggest.
 */
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
/**
 * The one italic, for the delivery badge's forward lean.
 *
 * Carried as a real face rather than a `skewX` transform (which is what the
 * badge used first) because a synthesised slant shears the glyphs — Inter's
 * true italic redraws them, and at 11px bold caps the difference between the
 * two is the difference between a typeface and a squashed one.
 *
 * It is the fifth face and the only italic, so it is imported by subpath for
 * the same reason as the four above.
 */
import { Inter_700Bold_Italic } from "@expo-google-fonts/inter/700Bold_Italic";

import { ConvexClerkProvider } from "../providers/ConvexClerkProvider";
import { LocationProvider } from "../providers/LocationProvider";
import { CartProvider } from "../providers/CartProvider";
import { ToastProvider } from "../providers/ToastProvider";
import {
  PAYSTACK_CHANNELS,
  PAYSTACK_CURRENCY,
  PAYSTACK_PUBLIC_KEY,
} from "../lib/paystack-config";
import { useInstallAttribution } from "../lib/use-install-attribution";
import { applyStoredTheme } from "../lib/theme-preference";

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

/**
 * Apply the customer's stored theme before the first paint.
 *
 * This used to be a hard `colorScheme.set("light")`, with a note to revisit
 * it once a settings screen existed to offer a choice. It does now, so light
 * is the DEFAULT rather than the law — `lib/theme-preference.ts` falls back
 * to it when nothing has been chosen, which keeps the original reasoning
 * intact for everyone who never opens Settings.
 *
 * Still at module scope, and still `colorScheme.set` rather than the
 * `useColorScheme` hook, for the original reasons: that store is what both
 * NativeWind's classes and this app's `useTokenColors()` read, and doing it
 * in an effect would run after the first frame — a visible flash of the
 * wrong theme on every cold start.
 */
applyStoredTheme();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  // Five faces. Four are named by fontFamily slots in tailwind.config.js
  // (`font-black` resolves to Bold); the italic deliberately has no slot and
  // is referenced by name in a style prop — see the note in that config.
  // Naming a slot with no face loaded here fails silently: the text renders
  // in the system font.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
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
        {/*
          Outside everything else so its overlay paints above the Stack AND
          above anything rendered through PortalHost (dialogs, sheets) — a
          success toast after confirming a destructive dialog needs to be
          visible once that dialog has closed, not underneath it.
        */}
        <ToastProvider>
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
                // Dev only: logs each message from the payment sheet, which is
                // the only place Paystack's own reason for a failure appears.
                debug={__DEV__}
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
                  {/*
                    A bottom sheet (via @gorhom/bottom-sheet inside the
                    screen), not a pushed page — `transparentModal` is what
                    lets the catalogue show through, undimmed, behind it. The
                    screen's own animation is `fade` rather than
                    `slide_from_bottom`: the sheet's slide-up motion is
                    `BottomSheet`'s own open animation, and stacking the
                    navigator's slide on top of that doubled the motion. Still
                    the same deep-linkable `/product/[productId]` route
                    underneath: opened directly (a shared link, a cold start)
                    it has no catalogue behind it, so the sheet opens over
                    this app's plain background instead — a reasonable
                    fallback, not a broken state.
                  */}
                  <Stack.Screen
                    name="product/[productId]"
                    options={{
                      presentation: "transparentModal",
                      animation: "fade",
                    }}
                  />
                  {/*
                    Search is a pushed route rather than a tab, matching the app
                    this replaces, which reached it from a control in the
                    catalogue header. The URL is unchanged at `/search`.
                  */}
                  <Stack.Screen name="search" />
                  <Stack.Screen name="cart" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="change-password" />
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
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
