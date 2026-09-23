import { useState } from "react";
import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { remapProps } from "nativewind";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { Icon } from "../../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { useCategoryTree } from "../../../lib/catalogue";
import {
  CategoryCard,
  CategoryCardSkeleton,
} from "../../../components/category-card";
import { BrandHeader } from "../../../components/brand-header";
import { BannerCarousel } from "../../../components/banner-carousel";

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
/**
 * The list, wrapped so its scroll offset can drive the header's collapsing
 * banner rail on the UI thread. A plain `onScroll` callback would hand every
 * frame to JS first, which is visible as the banners lagging behind the
 * finger.
 */
// Cast back to `typeof FlashList`: `createAnimatedComponent` erases the
// generic, which would silently degrade every `item` in this file to
// `unknown` — the props are otherwise identical.
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

// NativeWind keys its registrations by component IDENTITY, and the animated
// wrapper is a different component from the FlashList registered in
// `lib/flashlist-interop.ts`. Without this line THIS screen alone would go
// back to dropping `contentContainerClassName` on the floor.
remapProps(AnimatedFlashList, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

export default function CategoriesScreen() {
  const tree = useCategoryTree();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  // Two renders per scroll gesture, which is what it costs to tell the
  // carousel to stop advancing itself while the page is moving. Its own
  // touch handler only sees touches on the carousel, so it cannot know.
  const [scrolling, setScrolling] = useState(false);

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      {/*
        No `sweep`: the rounded bottom now belongs to the banner block below,
        which scrolls. At rest the two are one continuous yellow shape; once
        scrolled, the band is what remains.
      */}
      <BrandHeader showLocation showSearchButton logoRow />

      {tree.loading ? (
        // The banner does not wait for the catalogue — it is its own query,
        // and this branch renders instead of the list rather than inside it.
        // No bleed wrapper here: nothing is padding it.
        <>
          <BannerCarousel />
          <CategoryListSkeleton />
        </>
      ) : (
        <AnimatedFlashList
          onScroll={onScroll}
          onScrollBeginDrag={() => setScrolling(true)}
          onScrollEndDrag={() => setScrolling(false)}
          onMomentumScrollEnd={() => setScrolling(false)}
          scrollEventThrottle={16}
          // Nothing here needs its content anchored, and leaving it on lets
          // FlashList correct the scroll offset in response to a layout
          // change — one half of the feedback loop the banner used to sit in.
          maintainVisibleContentPosition={{ disabled: true }}
          data={tree.level1}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-8"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          ListHeaderComponent={
            <>
              {/*
                The banner is content, not chrome — but it is also the bottom
                of the yellow header, so its background has to reach both
                screen edges while everything else on this list stays on the
                16px gutter. The block cancels the content container's own
                padding with `-mx-screen`; see the note on its wrapper.
              */}
              <BannerCarousel scrollY={scrollY} paused={scrolling} />
              <View className="pb-space-6 pt-space-6">
                <Text variant="heading" size="h2">
                  What are you shopping for today?
                </Text>
                <Text
                  variant="muted"
                  size="base"
                  className="mt-space-2"
                >
                  Choose a category to get started
                </Text>
              </View>

              {/*
                The way into clearance. It is a separate catalogue with its own
                stock, expiry and delivery rule, so it gets an entry point
                rather than being mixed into the category grid where its
                prices would look like ordinary ones.

                Above the first category card, not below the last: clearance
                is time-sensitive stock, and a side door worth noticing before
                someone has already scrolled past it. `mb-space-4` stands in
                for `ItemSeparatorComponent`, which only renders BETWEEN items
                in `data` — nothing places a gap between the header and the
                first card on its own.
              */}
              <Pressable
                onPress={() => router.push("/clearance")}
                accessibilityRole="button"
                accessibilityLabel="Clearance deals"
                className="border-hairline border-border bg-card mb-space-4 gap-space-3 p-space-4 flex-row items-center rounded-lg active:opacity-90"
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
            </>
          }
          renderItem={({ item }) => (
            <CategoryCard
              category={item}
              onPress={() => router.push(`/c/${item.slug}`)}
            />
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
