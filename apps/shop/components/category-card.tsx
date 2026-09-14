import { Pressable, View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import type { CategoryNodeForShop } from "../lib/catalogue";

/**
 * A category, as a full-width card — used for both the top-level Home list
 * and the subcategory screen, the same component either way, since there is
 * nothing genuinely different about a subcategory's presentation.
 *
 * ── Deliberately simple, not a hint-row-and-arrow-chip card ────────────────
 *
 * Image, name, description. No "Browse categories"/"View products" hint
 * line, no arrow affordance, no subcategory-count badge — the whole card is
 * already the tap target, so a second visual cue announcing that is noise.
 * Separation from the page comes from `shadow-card` alone, no border: a
 * hairline plus a shadow doubles up on the same job.
 *
 * `description` is real seeded/authored copy (see
 * `packages/backend/convex/data/categories.ts`'s `backfillMissingDescriptions`
 * for how older rows get a placeholder) — rendered only when present, rather
 * than falling back to invented text or the subcategory count the previous
 * version of this card showed.
 */

const IMAGE_FALLBACK_BG = "bg-blink-50";

export function CategoryCard({
  category,
  onPress,
}: {
  category: CategoryNodeForShop;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      className="bg-card overflow-hidden rounded-lg shadow-card active:opacity-90"
    >
      <View className="h-[150px] w-full">
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

      <View className="gap-space-1 p-space-4">
        <Text weight="semibold" numberOfLines={1} size="base" className="text-strong">
          {category.name}
        </Text>
        {category.description ? (
          <Text size="caption" variant="subtle" numberOfLines={2}>
            {category.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Placeholder at roughly the geometry of the real card, so nothing shifts
 * position when the data arrives.
 */
export function CategoryCardSkeleton() {
  return (
    <View className="bg-card overflow-hidden rounded-lg shadow-card">
      <Skeleton className="h-[150px] w-full rounded-none" />
      <View className="gap-space-2 p-space-4">
        <Skeleton className="h-[15px] w-3/5 rounded-sm" />
        <Skeleton className="h-[11px] w-full rounded-sm" />
        <Skeleton className="h-[11px] w-4/5 rounded-sm" />
      </View>
    </View>
  );
}
