import { Stack } from "expo-router";

/**
 * The catalogue drill-down, as a nested Stack inside the home tab.
 *
 * Nesting it here rather than at the root does two things:
 *
 *  - the bottom nav stays visible through categories -> subcategories ->
 *    products, so browsing feels like one place rather than three;
 *  - tapping the already-active Home tab pops this stack to its root, which IS
 *    "back to categories". blink-ecommerce hijacked `tabPress` with
 *    `preventDefault()` and a manual state reset to achieve the same thing, and
 *    that hijack is one of the eight causes of its refresh-to-home bug. Here it
 *    is the framework default and needs no code.
 */
export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    />
  );
}
