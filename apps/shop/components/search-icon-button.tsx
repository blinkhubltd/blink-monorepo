import { Pressable } from "react-native";
import { router } from "expo-router";
import { Icon } from "./icon";

/**
 * The search button on the brand-surface header, next to the cart.
 *
 * Pushes straight to `/search` with no term — the header does not hold a
 * live query itself. See `lib/use-product-search.ts` for why: the app this
 * replaces had three overlapping search components because the query lived
 * in the header's own state, threaded back down through callbacks.
 */
export function SearchIconButton() {
  return (
    <Pressable
      onPress={() => router.push("/search")}
      accessibilityRole="search"
      accessibilityLabel="Search products"
      className="size-control rounded-pill bg-on-brand-pill items-center justify-center active:opacity-90"
    >
      <Icon name="search" size={20} tone="onBrandPill" />
    </Pressable>
  );
}
