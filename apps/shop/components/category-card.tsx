import { Pressable, View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Icon } from "./icon";

import type { CategoryNodeForShop } from "../lib/catalogue";

/**
 * A top-level category, as a full-width card in a single-column list.
 *
 * Replaces the previous two-column `CategoryTile` grid, to match the Home
 * screen design exactly: a 168px photo, name, a secondary line, and an
 * explicit "View products" call to action with a yellow arrow square.
 *
 * ── The secondary line is a subcategory count, not a description ─────────
 *
 * The design's mock data invents a marketing description per category
 * ("Everyday items you need at home, like groceries…"). This app's real
 * category data has no description field — adding one would be a schema
 * change well beyond restyling this screen. The subcategory count already
 * shown by the tile this replaces fills the same visual slot honestly: it is
 * real data already in the tree's cache, not prose invented to fill a line.
 *
 * What is still deliberately NOT here, per the tile this replaces: a product
 * count. It would need a coverage-dependent scan per card and would read as
 * a confidently precise number that is frequently wrong the instant the
 * customer's address changes.
 */

const IMAGE_FALLBACK_BG = "bg-blink-50";

export function CategoryCard({
  category,
  childCount,
  onPress,
}: {
  category: CategoryNodeForShop;
  childCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${childCount} ${
        childCount === 1 ? "subcategory" : "subcategories"
      }`}
      className="border-hairline border-border bg-card overflow-hidden rounded-lg shadow-xs active:opacity-95"
    >
      <View className="h-[168px] w-full">
        {category.imageUrl ? (
          <OptimizedImage
            source={{ uri: category.imageUrl }}
            // `cover` here, unlike the product card: a category image is
            // scene-setting, so cropping it is fine. A product image is a
            // label the shopper is reading, so it must not be cropped.
            contentFit="cover"
            className="h-full w-full rounded-none"
            accessibilityIgnoresInvertColors
          />
        ) : (
          /*
           * Reached when a category has no image, AND when it holds a storage
           * id whose blob has been deleted — `imageUrl` is null in both
           * cases. The old cards rendered a broken-image box for the second
           * one.
           */
          <View
            className={`h-full w-full items-center justify-center ${IMAGE_FALLBACK_BG}`}
          >
            <Text size="h1" weight="bold" className="text-ink-800">
              {category.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View className="gap-space-1 px-space-5 pb-[14px] pt-space-5">
        <Text weight="bold" numberOfLines={1} className="text-[19px] text-strong">
          {category.name}
        </Text>
        <Text
          numberOfLines={2}
          className="text-muted-foreground text-[14px] leading-[21px]"
        >
          {childCount} {childCount === 1 ? "subcategory" : "subcategories"}
        </Text>

        <View className="mt-[14px] flex-row items-center justify-between gap-space-4">
          <Text weight="semibold" className="text-[14px] text-strong">
            View products
          </Text>
          <View className="bg-primary size-[36px] items-center justify-center rounded-[10px]">
            <Icon name="arrow-forward" size={18} tone="onBrand" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Placeholder at the exact geometry of the real card, so nothing shifts
 * position when the data arrives.
 */
export function CategoryCardSkeleton() {
  return (
    <View className="border-hairline border-border bg-card overflow-hidden rounded-lg">
      <Skeleton className="h-[168px] w-full rounded-none" />
      <View className="gap-space-2 px-space-5 pb-[14px] pt-space-5">
        <Skeleton className="h-[19px] w-3/5 rounded-sm" />
        <Skeleton className="h-[14px] w-2/5 rounded-sm" />
        <Skeleton className="mt-[6px] h-[36px] w-full rounded-md" />
      </View>
    </View>
  );
}
