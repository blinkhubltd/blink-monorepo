import { FlatList, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { useCategoryFromSlugs } from "../../../../../lib/catalogue";
import { ScreenHeader } from "../../../../../components/screen-header";
import { NotFoundState } from "../../../../../components/states";

/**
 * Level 2: the subcategories of one top-level category. URL `/c/[l1Slug]`.
 *
 * ── A list, not a grid, deliberately ──────────────────────────────────────
 *
 * Level-2 names are long and multi-word — "Soft drinks & mixers", "Household
 * cleaning", "Rice, pasta & grains". A two-column grid truncates them into
 * ambiguity at exactly the point where the customer is trying to be precise.
 * A full-width row fits the whole name, and at 6-12 siblings a list is also the
 * fastest thing to scan. This is Glovo's in-store category list.
 *
 * Replaces `SubcategoriesView` and deletes `CategoryCard.tsx`, which used a raw
 * RN `Image` with inline styles and carried a `childCount` prop the home screen
 * never passed — so its "Browse categories" branch was permanently dead.
 */
export default function SubcategoriesScreen() {
  const { l1Slug } = useLocalSearchParams<{ l1Slug: string }>();
  const { loading, notFound, tree, level1 } = useCategoryFromSlugs(l1Slug);

  // Order matters: `loading` is checked FIRST. On a cold reload of this URL the
  // tree is briefly undefined, and answering "not found" then is precisely how
  // refresh-to-home comes back.
  if (loading) return <SubcategoriesSkeleton />;
  if (notFound || !level1) {
    return <NotFoundState what="category" onBack={() => router.replace("/")} />;
  }

  const children = tree.childrenOf(level1._id);
  const leafTotal = children.reduce(
    (sum, child) => sum + tree.pillsFor(child._id).length,
    0,
  );

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Shop"
        title={level1.name}
        subtitle={`${children.length} ${
          children.length === 1 ? "subcategory" : "subcategories"
        } · ${leafTotal} product ${leafTotal === 1 ? "type" : "types"}`}
      />

      <FlatList
        data={children}
        keyExtractor={(item) => item._id}
        ItemSeparatorComponent={() => <Separator />}
        contentContainerClassName="pb-space-8"
        renderItem={({ item }) => {
          const pills = tree.pillsFor(item._id);
          return (
            <Pressable
              onPress={() => router.push(`/c/${level1.slug}/${item.slug}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${pills.length} product types`}
              className="min-h-control gap-space-4 px-screen py-space-4 active:bg-muted flex-row items-center"
            >
              {item.imageUrl ? (
                <OptimizedImage
                  source={{ uri: item.imageUrl }}
                  contentFit="cover"
                  className="size-[64px] rounded-md"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View className="bg-blink-50 size-[64px] items-center justify-center rounded-md">
                  <Text size="h3" weight="bold" className="text-ink-800">
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              <View className="gap-space-1 flex-1">
                <Text size="base" weight="semibold" numberOfLines={2}>
                  {item.name}
                </Text>
                <Text size="caption" variant="subtle">
                  {pills.length}{" "}
                  {pills.length === 1 ? "product type" : "product types"}
                </Text>
              </View>

              <ChevronRight size={20} color="#818A99" />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="gap-space-2 px-screen py-space-10 items-center">
            <Text size="lg" weight="semibold">
              Nothing in {level1.name} yet
            </Text>
            <Text variant="muted" size="sm" className="text-center">
              This section is still being stocked.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function SubcategoriesSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="gap-space-2 px-screen py-space-5">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[28px] w-3/5 rounded-sm" />
        <Skeleton className="h-[16px] w-2/5 rounded-sm" />
      </View>
      {/* Same 64px thumb and two text lines as the real row, so nothing jumps. */}
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          className="gap-space-4 px-screen py-space-4 flex-row items-center"
        >
          <Skeleton className="size-[64px] rounded-md" />
          <View className="gap-space-2 flex-1">
            <Skeleton className="h-[15px] w-3/5 rounded-sm" />
            <Skeleton className="h-[11px] w-1/4 rounded-sm" />
          </View>
        </View>
      ))}
    </SafeAreaView>
  );
}
