import { useColorScheme } from "nativewind";

/**
 * The palette, mirrored into JS for the props that `className` cannot reach.
 *
 * ── Why this file has to exist ────────────────────────────────────────────
 *
 * Almost everything in this app is styled with NativeWind classes, which read
 * `global.css` directly and so theme for free. A handful of things cannot:
 *
 *   - React Navigation's `tabBarStyle` / `tabBarActiveTintColor` take plain
 *     style objects and colour strings, never a className.
 *   - `@expo/vector-icons` glyphs take a `color` prop.
 *   - `ActivityIndicator` takes a `color` prop.
 *   - react-native-maps styling is a JS object.
 *
 * Before this file, those places held 99 hardcoded hex literals across 32 files,
 * every one of them a light-mode value. That is why the app's dark mode was
 * broken for every icon and for the tab bar: the classes flipped, the props did
 * not.
 *
 * ── This duplicates global.css, and that is the tradeoff ──────────────────
 *
 * Two sources of truth for the same colours is a real cost, so it is paid once,
 * here, rather than per call site. The names below are ROLES that mirror
 * specific tokens — the mapping is recorded against each one — so when a token
 * changes there is exactly one place to follow it. Adding a colour to a
 * component instead of adding a role here is the thing to push back on in
 * review.
 *
 * `satisfies` rather than a bare object: both schemes must define every role, so
 * a role added to the union with no dark value is a type error rather than an
 * `undefined` colour prop that renders black.
 */

export type TokenColor =
  /** --color-strong — headings, primary icon weight */
  | "strong"
  /** --color-muted-foreground — the default icon weight */
  | "body"
  /** --color-subtle — de-emphasised icons, placeholders */
  | "subtle"
  /** --color-primary-foreground — on the yellow band or a primary button */
  | "onBrand"
  /** --color-on-brand-pill-foreground — inside an ink pill on the yellow band */
  | "onBrandPill"
  /** --color-inverse-foreground — on an inverse surface */
  | "onInverse"
  /** --color-primary — the brand yellow itself */
  | "brand"
  /** --color-price */
  | "price"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "transit"
  /** --color-border — hairlines in style objects */
  | "border"
  /** --color-card — surfaces in style objects */
  | "card";

const LIGHT = {
  strong: "#0A0E16",
  body: "#5A6372",
  subtle: "#818A99",
  onBrand: "#0A0E16",
  onBrandPill: "#FFFFFF",
  onInverse: "#FFFFFF",
  brand: "#FFC50B",
  price: "#6E5000",
  destructive: "#E23B33",
  success: "#0F7A4D",
  warning: "#F5B800",
  info: "#2563EB",
  transit: "#EA580C",
  border: "#E4E7EC",
  card: "#FFFFFF",
} satisfies Record<TokenColor, string>;

const DARK = {
  strong: "#FFFFFF",
  body: "#A8B0BC",
  subtle: "#818A99",
  onBrand: "#0A0E16", // the yellow does not flip, so neither does its foreground
  onBrandPill: "#FFC50B",
  onInverse: "#0A0E16",
  brand: "#FFC50B",
  price: "#FFC50B",
  destructive: "#E23B33",
  success: "#159B62",
  warning: "#F5B800",
  info: "#60A5FA",
  transit: "#FB923C",
  border: "#242A36",
  card: "#151A24",
} satisfies Record<TokenColor, string>;

export const TOKEN_COLORS = { light: LIGHT, dark: DARK };

/**
 * The palette for the active scheme.
 *
 * `useColorScheme` here is NativeWind's, the same one `app/_layout.tsx` reads
 * for the status bar — not React Native's — so it follows NativeWind's notion of
 * the active scheme and stays in step with what the classes are doing.
 */
export function useTokenColors(): Record<TokenColor, string> {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? DARK : LIGHT;
}

/**
 * The palette for a scheme resolved by the caller.
 *
 * For the few places that already hold a scheme and cannot call a hook — a
 * navigator's `screenOptions` factory, for instance.
 */
export function tokenColors(
  colorScheme: "light" | "dark" | undefined,
): Record<TokenColor, string> {
  return colorScheme === "dark" ? DARK : LIGHT;
}
