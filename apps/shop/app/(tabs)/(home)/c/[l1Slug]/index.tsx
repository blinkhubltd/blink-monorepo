import { FlatList, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { useCategoryFromSlugs } from "../../../../../lib/catalogue";
import { ScreenHeader } from "../../../../../components/screen-header";
import { CartIconButton } from "../../../../../components/cart-icon-button";
import {
  CategoryCard,
  CategoryCardSkeleton,
} from "../../../../../components/category-card";
import { NotFoundState } from "../../../../../components/states";

/**
 * Level 2: the subcategories of one top-level category. URL `/c/[l1Slug]`.
 *
 * Same `CategoryCard` as the top-level Home list — there's nothing genuinely
 * different about a subcategory's presentation, matching how blink-ecommerce's
 * `SubcategoriesView` reuses its own `CategoryCard` rather than having a
 * distinct one.
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
        eyebrow="Home"
        title={level1.name}
        subtitle={`${children.length} ${
          children.length === 1 ? "subcategory" : "subcategories"
        } · ${leafTotal} product ${leafTotal === 1 ? "type" : "types"}`}
        right={<CartIconButton plain />}
      />

      <FlatList
        data={children}
        keyExtractor={(item) => item._id}
        contentContainerClassName="px-screen pb-space-8 pt-space-4"
        ItemSeparatorComponent={() => <View className="h-space-4" />}
        renderItem={({ item }) => (
          <CategoryCard
            category={item}
            onPress={() => router.push(`/c/${level1.slug}/${item.slug}`)}
          />
        )}
        ListEmptyComponent={
          <View className="gap-space-2 py-space-10 items-center">
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
      <View className="px-screen gap-space-4">
        {Array.from({ length: 3 }, (_, i) => (
          <CategoryCardSkeleton key={i} />
        ))}
      </View>
    </SafeAreaView>
  );
}
