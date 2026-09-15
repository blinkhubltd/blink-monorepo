import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Icon } from "./icon";
import { useCart } from "../providers/CartProvider";

/**
 * The basket button that rides on a header.
 *
 * Its own component because the badge JSX used to be copy-pasted verbatim
 * between shop-header.tsx and screen-header.tsx — one basket, one count, one
 * component. `plain` drops the filled ink-pill circle for a bare icon: the
 * pill treatment reads right sitting on the yellow brand surface, but is too
 * heavy on `ScreenHeader`'s plain white/card surface, where a bare icon with
 * a badge is what most apps use.
 */
export function CartIconButton({ plain = false }: { plain?: boolean }) {
  const { count } = useCart();

  return (
    <Pressable
      onPress={() => router.push("/cart")}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Basket, ${count} items` : "Basket, empty"}
      className={
        plain
          ? "size-control-sm items-center justify-center active:opacity-70"
          : "size-control-sm rounded-pill bg-on-brand-pill items-center justify-center active:opacity-90"
      }
    >
      <Icon
        name="cart-outline"
        size={plain ? 22 : 16}
        tone={plain ? "strong" : "onBrandPill"}
      />
      {count > 0 ? (
        <View
          className="bg-destructive rounded-pill absolute items-center justify-center"
          style={{
            right: -4,
            top: -4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: count > 9 ? 4 : 0,
          }}
        >
          {/*
            No white-on-destructive Text variant exists yet, and this is its
            only consumer — an override, not a case for a new shared variant.

            `size="caption"` is the DS's smallest type step, but even that is
            11px/15px — a 15px line height inside a 16px-tall badge is what
            was making the digit sit low and the whole thing read as
            oversized for a single character. A fixed, tight lineHeight equal
            to the font size is what a numeral this small actually needs.
          */}
          <Text
            weight="bold"
            className="text-destructive-foreground"
            style={{ fontSize: 10, lineHeight: 12 }}
          >
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
