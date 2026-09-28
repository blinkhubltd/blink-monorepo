/**
 * Blink shop (customer app) — NativeWind (Tailwind v3) config.
 *
 * Nearly empty on purpose. The design system — every colour, font, size,
 * radius and shadow class — comes from the shared preset in
 * packages/mobile-ui/theme/, which apps/rider uses too, and the values those
 * classes resolve to come from tokens.css beside it. What stays here is what is
 * genuinely per-app: which source files to scan.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./providers/**/*.{ts,tsx}",
    // The shared primitives must be in `content` or their classes are purged
    // and every button in the app renders unstyled.
    "../../packages/mobile-ui/src/**/*.{ts,tsx}",
  ],
  // No `safelist`, deliberately. The app this replaces carried a regex
  // safelisting every `(bg|border|text)-(primary|...)-(50..950)` combination,
  // which exists to support class names built by string interpolation —
  // `bg-${status}-500`. Those are unsafe by construction: a typo yields an
  // invisibly unstyled element rather than an error, and the safelist has to
  // grow forever to cover them.
  //
  // Dynamic classes here go through a typed lookup instead:
  //   satisfies Record<OrderStatus, string>
  // so a missing case is a *type* error. See lib/status-styles.ts.
  //
  // Also no `important: "html"`. That existed to beat Gluestack's generated
  // styles; with plain NativeWind plus `cn()`, precedence is resolved at the
  // class-string level.
  presets: [
    require("nativewind/preset"),
    require("../../packages/mobile-ui/theme/tailwind-preset"),
  ],
  plugins: [],
};
