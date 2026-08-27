import { Pressable, View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import type { CategoryNodeForShop } from "../lib/catalogue";

/**
 * A top-level category, as an image-led tile in a two-column grid.
 *
 * Glovo's pattern for the same job: pictures at the top level because you are
 * choosing a *domain* and recognise it faster by image than by word, then text
 * rows deeper in where the distinctions are verbal ("Soft drinks & mixers" vs
 * "Juices & smoothies").
 *
 * What is deliberately NOT on the tile: prices, product counts, badges,
 * wishlist. A product count would need a scan per tile and is
 * coverage-dependent — it changes the instant the customer's address does — so
 * it would be a confidently precise number that is frequently wrong. The
 * subcategory count below is free: it comes from the tree already in the cache.
 */

const IMAGE_FALLBACK_BG = "bg-blink-50";

export function CategoryTile({
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
      className="border-hairline border-border bg-card flex-1 overflow-hidden rounded-xl shadow-xs active:opacity-90"
    >
      <View className="aspect-[4/3] w-full">
        {category.imageUrl ? (
          <OptimizedImage
            source={{ uri: category.imageUrl }}
            // `cover` here, unlike the product card: a category image is
            // scene-setting, so cropping it is fine. A product image is a label
            // the shopper is reading, so it must not be cropped.
            contentFit="cover"
            className="h-full w-full rounded-none"
            accessibilityIgnoresInvertColors
          />
        ) : (
          /*
           * Reached when a category has no image, AND when it holds a storage id
           * whose blob has been deleted — `imageUrl` is null in both cases. The
           * old cards rendered a broken-image box for the second one.
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

      {/*
        Fixed height on the text block so tiles line up across a row regardless
        of whether a name wraps to two lines. Without it, a one-line name and a
        two-line name give two different card heights and the grid stops
        looking like a grid.
      */}
      <View className="gap-space-1 p-space-4">
        <Text
          size="h4"
          weight="semibold"
          numberOfLines={2}
          className="min-h-[44px]"
        >
          {category.name}
        </Text>
        <Text size="caption" variant="subtle">
          {childCount} {childCount === 1 ? "subcategory" : "subcategories"}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Placeholder at the exact geometry of the real tile.
 *
 * Same aspect ratio, same fixed text-block height, so nothing shifts position
 * when the data arrives. A skeleton whose shape differs from the thing it stands
 * in for causes a visible jump, which reads as jank rather than as loading.
 */
export function CategoryTileSkeleton() {
  return (
    <View className="border-hairline border-border bg-card flex-1 overflow-hidden rounded-xl">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <View className="gap-space-2 p-space-4">
        <Skeleton className="h-[16px] w-3/4 rounded-sm" />
        <Skeleton className="h-[16px] w-1/2 rounded-sm" />
        <Skeleton className="h-[11px] w-2/5 rounded-sm" />
      </View>
    </View>
  );
}
