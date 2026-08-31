import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, Tag } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { useCategoryTree } from "../../../lib/catalogue";
import {
  CategoryTile,
  CategoryTileSkeleton,
} from "../../../components/category-tile";
import { ShopHeader } from "../../../components/shop-header";

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
 */
export default function CategoriesScreen() {
  const tree = useCategoryTree();

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ShopHeader title="Shop" />

      {/*
        Loading and loaded are separate renders rather than one list fed
        placeholder items. Faking list data means casting it to the real item
        type and lying to the type checker at exactly the point where a mistake
        renders a blank card.
      */}
      {tree.loading ? (
        <CategoryGridSkeleton />
      ) : (
        <FlashList
          data={tree.level1}
          numColumns={2}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-8"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          ListHeaderComponent={
            /*
              The way into clearance. It is a separate catalogue with its own
              stock, expiry and delivery rule, so it gets an entry point rather
              than being mixed into the category grid where its prices would
              look like ordinary ones.
            */
            <Pressable
              onPress={() => router.push("/clearance")}
              accessibilityRole="button"
              accessibilityLabel="Clearance deals"
              className="border-hairline border-border bg-card mb-space-4 gap-space-3 p-space-4 flex-row items-center rounded-xl active:opacity-90"
            >
              <View className="bg-primary size-control rounded-pill items-center justify-center">
                <Tag size={20} color="#0A0E16" />
              </View>
              <View className="gap-space-1 flex-1">
                <Text size="base" weight="semibold">
                  Clearance deals
                </Text>
                <Text size="caption" variant="subtle">
                  Short-dated stock at a discount
                </Text>
              </View>
              <ChevronRight size={18} color="#818A99" />
            </Pressable>
          }
          renderItem={({ item, index }) => (
            // Manual gutter: FlashList v2 has no columnWrapper, and padding the
            // odd column keeps both tiles the same width.
            <View
              className={
                index % 2 === 0 ? "pr-space-2 flex-1" : "pl-space-2 flex-1"
              }
            >
              <CategoryTile
                category={item}
                childCount={tree.childrenOf(item._id).length}
                onPress={() => router.push(`/c/${item.slug}`)}
              />
            </View>
          )}
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
 * Six tiles at the real geometry, so the skeleton occupies the space the
 * content will and nothing jumps when it arrives.
 */
function CategoryGridSkeleton() {
  return (
    <View className="px-screen flex-row flex-wrap">
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          className={`mb-space-4 w-1/2 ${
            i % 2 === 0 ? "pr-space-2" : "pl-space-2"
          }`}
        >
          <CategoryTileSkeleton />
        </View>
      ))}
    </View>
  );
}
