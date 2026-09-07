import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { useCategoryTree } from "../../../lib/catalogue";
import {
  CategoryCard,
  CategoryCardSkeleton,
} from "../../../components/category-card";
import { BrandHeader } from "../../../components/brand-header";

/**
 * The first screen: top-level categories.
 *
 * URL is `/` — `(tabs)` and `(home)` are groups, so they contribute nothing to
 * the path. There is deliberately no `app/index.tsx` in this app: in
 * blink-ecommerce that file did
 *
 *     if (isSignedIn) return <Redirect href="/tabs/(tabs)/home" />;
 *
 * which made `/` a catch-all that bounced signed-in users to the home screen
 * regardless of where they had actually been. With the catalogue root *being*
 * `/`, there is no route left whose job is to redirect.
 *
 * A `FlashList`, not a `ScrollView` with `.map()`. The screen this replaces
 * mapped every category inside a ScrollView, which is why it janked on first
 * paint with a real catalogue.
 *
 * ── Matches the Home design exactly (Claude Design canvas, AppHome.dc.html) ─
 *
 * Single-column cards, not the two-column grid this screen had before: see
 * `components/category-card.tsx` for the card itself. The header carries no
 * title — the heading below is on the plain background, not the yellow band,
 * and the header shows the wordmark and delivery badge instead (`logoRow`).
 * Search moved from a pill row inside the header to an icon button beside the
 * cart (`showSearchButton`); there is no header bell any more; notifications
 * stay reachable from Profile.
 */
export default function CategoriesScreen() {
  const tree = useCategoryTree();

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <BrandHeader showLocation showSearchButton sweep logoRow />

      {tree.loading ? (
        <CategoryListSkeleton />
      ) : (
        <FlashList
          data={tree.level1}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-8"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          ListHeaderComponent={
            <View className="pb-space-6 pt-space-6">
              <Text variant="heading" size="h1">
                What are you shopping for today?
              </Text>
              <Text
                variant="muted"
                size="lg"
                className="mt-space-2"
              >
                Choose a category to get started
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CategoryCard
              category={item}
              childCount={tree.childrenOf(item._id).length}
              onPress={() => router.push(`/c/${item.slug}`)}
            />
          )}
          ListFooterComponent={
            /*
              The way into clearance. It is a separate catalogue with its own
              stock, expiry and delivery rule, so it gets an entry point rather
              than being mixed into the category grid where its prices would
              look like ordinary ones.

              Moved here from above the categories: the design has nothing
              between the subtitle and the first card, and clearance is a
              side door, not the main flow — the footer is where a side door
              belongs once the primary path (the categories) has priority.
            */
            <Pressable
              onPress={() => router.push("/clearance")}
              accessibilityRole="button"
              accessibilityLabel="Clearance deals"
              className="border-hairline border-border bg-card mt-space-4 gap-space-3 p-space-4 flex-row items-center rounded-lg active:opacity-90"
            >
              <View className="bg-primary size-control rounded-pill items-center justify-center">
                <Icon name="pricetag-outline" size={20} tone="onBrand" />
              </View>
              <View className="gap-space-1 flex-1">
                <Text size="base" weight="semibold">
                  Clearance deals
                </Text>
                <Text size="caption" variant="subtle">
                  Short-dated stock at a discount
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} tone="subtle" />
            </Pressable>
          }
          ListEmptyComponent={
            // Reachable only once the tree has RESOLVED and is genuinely empty.
            // Conflating that with the loading state is what puts "nothing here"
            // on screen during a normal load.
            <View className="gap-space-2 py-space-10 items-center">
              <Text size="lg" weight="semibold">
                Nothing to shop yet
              </Text>
              <Text variant="muted" size="sm" className="text-center">
                The catalogue is still being set up. Check back shortly.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Three cards at the real geometry, so the skeleton occupies the space the
 * content will and nothing jumps when it arrives. Three rather than six, now
 * that cards are full-width and considerably taller than the old grid tiles.
 */
function CategoryListSkeleton() {
  return (
    <View className="px-screen gap-space-4 pt-space-6">
      {Array.from({ length: 3 }, (_, i) => (
        <CategoryCardSkeleton key={i} />
      ))}
    </View>
  );
}
