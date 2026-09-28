/**
 * Blink rider — NativeWind (Tailwind v3) config.
 *
 * Nearly empty on purpose. The design system — every colour, font, size,
 * radius and shadow class — comes from the shared preset in
 * packages/mobile-ui/theme/, which apps/shop uses too, and the values those
 * classes resolve to come from tokens.css beside it. Before that, this file
 * carried its own copy of the shop's config that had quietly fallen behind it:
 * Rubik instead of Inter, and none of the shop's contrast fixes. What stays
 * here is what is genuinely per-app: which source files to scan.
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
  presets: [
    require("nativewind/preset"),
    require("../../packages/mobile-ui/theme/tailwind-preset"),
  ],
  plugins: [],
};
