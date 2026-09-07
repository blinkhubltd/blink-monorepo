import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";
import { useCart } from "../providers/CartProvider";

/**
 * The basket button that rides on every brand-surface header.
 *
 * Its own component because the badge JSX used to be copy-pasted verbatim
 * between shop-header.tsx and screen-header.tsx — one basket, one count, one
 * component. Always an ink pill: every header is now the yellow surface, so
 * there is no "on card" variant to support.
 */
export function CartIconButton() {
  const { count } = useCart();

  return (
    <Pressable
      onPress={() => router.push("/cart")}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Basket, ${count} items` : "Basket, empty"}
      className="size-control rounded-pill bg-on-brand-pill items-center justify-center active:opacity-90"
    >
      <Icon name="bag-outline" size={20} tone="onBrandPill" />
      {count > 0 ? (
        <View className="bg-destructive right-space-1 top-space-1 min-w-[18px] rounded-pill absolute items-center justify-center px-[4px]">
          {/* No white-on-destructive Text variant exists yet, and this is its
              only consumer — an override, not a case for a new shared variant. */}
          <Text size="caption" weight="bold" className="text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
