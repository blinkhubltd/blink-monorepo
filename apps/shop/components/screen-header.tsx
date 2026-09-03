import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ShoppingBag } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

import { useCart } from "../providers/CartProvider";

/**
 * Header for a pushed catalogue screen: back, breadcrumb, title.
 *
 * `headerShown` is off app-wide, so screens render their own. That is not
 * preference: the collapsing behaviour these screens need cannot be expressed
 * as native header options, and leaving the native header on as well is what
 * gave blink-ecommerce two stacked headers on its detail screens.
 */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  showCart = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  showCart?: boolean;
}) {
  const { count } = useCart();

  return (
    <View className="gap-space-2 px-screen pb-space-4 pt-space-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          className="size-control -ml-space-2 rounded-pill items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={24} color="#0A0E16" />
        </Pressable>

        {showCart ? (
          <Pressable
            onPress={() => router.push("/cart")}
            accessibilityRole="button"
            accessibilityLabel={
              count > 0 ? `Basket, ${count} items` : "Basket, empty"
            }
            className="size-control -mr-space-2 rounded-pill items-center justify-center active:opacity-70"
          >
            <ShoppingBag size={24} color="#0A0E16" />
            {/* Same badge as the catalogue header: one basket, one count. */}
            {count > 0 ? (
              <View className="bg-primary right-space-1 top-space-1 min-w-[18px] rounded-pill absolute items-center justify-center px-[4px]">
                <Text size="caption" weight="bold" variant="onBrand">
                  {count > 99 ? "99+" : count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      <View className="gap-space-1">
        {eyebrow ? (
          <Text variant="eyebrow" size="caption">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="heading" size="h1">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="muted" size="sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
