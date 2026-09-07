import { View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import BlinkHome from "../../assets/icons/tab/blink-home.svg";
import BlinkWishlist from "../../assets/icons/tab/blink-wishlist.svg";
import BlinkOrders from "../../assets/icons/tab/blink-orders.svg";
import BlinkProfile from "../../assets/icons/tab/blink-profile.svg";
import { tokenColors } from "../../lib/token-colors";

/**
 * The four customer tabs: Home, Wishlist, Orders, Profile.
 *
 * ── The glyphs are the brand SVGs, not Ionicons ───────────────────────────
 *
 * Every other icon in this app is an Ionicon. These four are the exception,
 * carried over from the app this replaces: they are brand marks rather than
 * generic symbols, and no icon set contains them. metro.config.js already
 * routes `.svg` through react-native-svg-transformer (react-native-qrcode-svg
 * depends on it), so importing them as components needs no build change — see
 * types/svg.d.ts for the TypeScript side.
 *
 * The fill is baked into each file as `#ffc50b`, and deliberately so: the
 * transformer's SVGO defaults inline the `<style>` blocks onto the paths
 * (`inlineStyles: { onlyMatchedOnce: false }`) and leave the colour alone
 * (`convertColors: false`). A `fill` prop on the root would NOT override those
 * per-path fills, so these glyphs are not tintable. Adding an svgr config file
 * to the repo would replace those defaults wholesale and render the glyphs
 * black — that, not the current state, is the thing to avoid.
 *
 * ── In light mode the pill is always drawn, which the original did not do ──
 *
 * The original showed a black pill only behind the focused tab and left the
 * other three as bare yellow glyphs on white. Because the fill is baked in,
 * `tabBarInactiveTintColor` never reached them — it only ever coloured the
 * label — so inactive tabs sat at roughly 1.7:1 against the bar, well under the
 * 3:1 that non-text content needs.
 *
 * Since the glyph cannot be dimmed, the surface behind it carries the state
 * instead: ink when focused (12.0:1, exactly as before), ink-100 when not
 * (~3.4:1). The focused tab is unchanged from the original; the other three
 * become legible. Scale still marks focus too, so the cue is not carried by
 * contrast alone.
 *
 * Dark mode keeps the original's focused-only pill, because there the same
 * glyph on the bar is already ~12.4:1 and there is nothing to fix. See the
 * comment on `pill` below.
 *
 * ── Geometry ─────────────────────────────────────────────────────────────
 *
 * The original set `height: 50 + insets.bottom` while drawing a 36px glyph in a
 * 6px-padded pill — a 48px pill and an 11px label inside 50px, which cannot
 * fit. This keeps the original's proportions and gives them room: a 30px glyph
 * in a 42px pill, in a 64px bar. Deliberately shorter than the 72px this app
 * had before, and taller than the 50px that clipped.
 *
 * ── No tabPress hijack ───────────────────────────────────────────────────
 *
 * The original intercepted `tabPress`, called `preventDefault()`, reset the
 * browse state machine and pushed home, so tapping Home always wiped your place
 * in the catalogue — one of the eight refresh-to-home causes. Expo Router's
 * default for tapping the active tab is "pop that tab's stack to its root",
 * which is the intended effect now that the drill-down is a real nested Stack.
 * So there is deliberately no `listeners` prop. Tap-to-scroll-top, if wanted,
 * is `useScrollToTop` in the screen — not a navigation override here.
 */

/** Glyph size inside the pill. */
const GLYPH = 30;

/** Padding around the glyph, so the pill is GLYPH + 2 * PILL_PAD across. */
const PILL_PAD = 6;

function TabGlyph({
  Glyph,
  focused,
  pill,
}: {
  Glyph: React.FC<{ width: number; height: number }>;
  focused: boolean;
  pill: { active: string; inactive: string };
}) {
  return (
    <View
      style={{
        backgroundColor: focused ? pill.active : pill.inactive,
        borderRadius: 24,
        padding: PILL_PAD,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: focused ? 1.05 : 1 }],
      }}
    >
      <Glyph width={GLYPH} height={GLYPH} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const colors = tokenColors(colorScheme);

  // React Navigation styles the bar with plain style objects and colour props,
  // never className, so these come from the JS mirror of the palette rather
  // than from Tailwind. Before this, the bar was hardcoded white — which meant
  // the app had a white tab bar in dark mode.
  //
  // The two schemes want genuinely different pills, because the problem the
  // pill solves only exists in one of them:
  //
  //   light — the glyph is #ffc50b on a white bar, about 1.7:1. It NEEDS a
  //           surface behind it, so the pill is always drawn: ink when focused,
  //           ink-100 when not.
  //   dark  — the same glyph on the #151a24 bar is already about 12.4:1, so
  //           there is nothing to fix. The pill goes back to marking focus and
  //           nothing else, which is what the original did: a lighter ink well
  //           when focused, nothing when not.
  const pill =
    colorScheme === "dark"
      ? { active: "#3A4150", inactive: "transparent" } // ink-700
      : { active: "#0A0E16", inactive: "#EFF1F5" }; // ink-950 / ink-100

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // The label, not the glyph: the glyph's colour is baked into the SVG.
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
        },
        // A raw face name, not a class: Tailwind cannot see this string, so it
        // does not change when tailwind.config.js's fontFamily does. Keep it in
        // step with the `medium` slot there or the labels silently fall back to
        // the system font.
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium" },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabGlyph Glyph={BlinkHome} focused={focused} pill={pill} />
          ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarIcon: ({ focused }) => (
            <TabGlyph Glyph={BlinkWishlist} focused={focused} pill={pill} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ focused }) => (
            <TabGlyph Glyph={BlinkOrders} focused={focused} pill={pill} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabGlyph Glyph={BlinkProfile} focused={focused} pill={pill} />
          ),
        }}
      />
    </Tabs>
  );
}
