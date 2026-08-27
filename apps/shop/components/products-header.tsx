import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ShoppingBag } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

/**
 * Title bar for the products screen.
 *
 * The count is rendered as "20+" rather than a precise figure whenever the
 * backend reports `totalIsExact: false`. The query this replaced recomputed a
 * precise-looking total on every page by scanning the whole category subtree —
 * expensive, and still wrong once the scan budget was hit. A number that costs
 * a full scan and can still mislead is worse than an honest approximation.
 */
export function ProductsHeader({
  eyebrow,
  title,
  count,
  countIsExact,
}: {
  eyebrow: string;
  title: string;
  count: number | null;
  countIsExact: boolean;
}) {
  const countLabel =
    count === null
      ? null
      : countIsExact
        ? `${count} ${count === 1 ? "item" : "items"}`
        : `${count}+ items`;

  return (
    <View className="gap-space-1 px-screen pt-space-2">
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

        <Pressable
          onPress={() => router.push("/cart")}
          accessibilityRole="button"
          accessibilityLabel="Basket"
          className="size-control -mr-space-2 rounded-pill items-center justify-center active:opacity-70"
        >
          <ShoppingBag size={24} color="#0A0E16" />
        </Pressable>
      </View>

      <Text variant="eyebrow" size="caption">
        {eyebrow}
      </Text>
      <View className="gap-space-3 flex-row items-baseline justify-between">
        <Text variant="heading" size="h3" numberOfLines={1} className="shrink">
          {title}
        </Text>
        {countLabel ? (
          <Text size="caption" variant="subtle">
            {countLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
