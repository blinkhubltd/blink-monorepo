import { useCallback } from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Id } from "@repo/backend/dataModel";

import { Text } from "@repo/mobile-ui/components/ui/text";

import { useCategoryFromSlugs } from "../../../../../lib/catalogue";
import { usePagedProducts } from "../../../../../lib/use-paged-products";
import { useLocation } from "../../../../../providers/LocationProvider";
import { useCart } from "../../../../../providers/CartProvider";
import {
  Level2PillRow,
  Level3PillRow,
} from "../../../../../components/category-pills";
import {
  ProductCard,
  ProductCardSkeleton,
} from "../../../../../components/product-card";
import { ProductsHeader } from "../../../../../components/products-header";
import { useWishlist } from "../../../../../lib/use-wishlist";
import {
  SaveError,
  SavePrompt,
} from "../../../../../components/save-prompt";
import {
  CoverageEmptyState,
  NeedsLocationState,
  NoProductsState,
  NotFoundState,
} from "../../../../../components/states";

/**
 * The products screen. URL `/c/[l1Slug]/[l2Slug]?t=[l3Slug]`.
 *
 * ── Two pill rows, two URL mechanisms ─────────────────────────────────────
 *
 * This is what makes the design survive a refresh:
 *
 *   Row 1 (level 2)  ->  the [l2Slug] PATH SEGMENT, changed with router.replace
 *   Row 2 (level 3)  ->  the ?t= SEARCH PARAM,      changed with setParams
 *
 * Row 1 changes the product set *and* the contents of row 2, so it is a
 * navigation and belongs in the path. `replace` rather than `push`, so tapping
 * through eight sibling pills does not build eight history entries — back from
 * here always lands on the subcategory list.
 *
 * Row 2 filters within the current set, so it is a search param mutated without
 * a history entry. Both live in the URL, so a reload restores both selections.
 * `?t` absent means the "All" chip.
 *
 * The screen this replaces held all of this in `useState` inside a 732-line home
 * screen, with the URL permanently `/tabs/(tabs)/home`. There was nothing to
 * restore, which is the entire refresh-to-home bug.
 */
export default function ProductsScreen() {
  const { l1Slug, l2Slug, t } = useLocalSearchParams<{
    l1Slug: string;
    l2Slug: string;
    t?: string;
  }>();

  const { loading, notFound, tree, level1, level2 } = useCategoryFromSlugs(
    l1Slug,
    l2Slug,
  );
  const { point, denied, request } = useLocation();
  const cart = useCart();
  const wishlist = useWishlist();

  const pills = level2 ? tree.pillsFor(level2._id) : [];
  const activeL3 = t ? (pills.find((p) => p.slug === t) ?? null) : null;

  const products = usePagedProducts({
    categoryId: level2?._id ?? null,
    l3CategoryId: activeL3?._id,
    point,
  });

  const selectLevel2 = useCallback(
    (slug: string) => {
      // replace, not push: sibling pills are lateral moves, not depth. Eight
      // taps must not mean eight presses of the back button to escape.
      router.replace(`/c/${l1Slug}/${slug}`);
    },
    [l1Slug],
  );

  const selectLevel3 = useCallback((slug: string | undefined) => {
    // setParams mutates the URL in place — no history entry, but a reload still
    // restores the filter.
    router.setParams({ t: slug });
  }, []);

  // ── Guard order matters. `loading` first, always. ──
  // On a cold reload of this URL the tree is briefly undefined. Answering
  // "not found" or redirecting during that window is exactly how the
  // refresh-to-home bug returns.
  if (loading) return <ProductsSkeleton />;
  if (notFound || !level1 || !level2) {
    return <NotFoundState what="category" onBack={() => router.replace("/")} />;
  }

  const siblings = tree.childrenOf(level1._id);

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      {/*
        Rows A/B/C live in a real sticky container OUTSIDE the list — not
        stickyHeaderIndices, and emphatically not the absolutely-positioned
        overlay the old ProductsView used, which is why its header floated on top
        of the first product row.
      */}
      <View className="gap-space-2 pb-space-2">
        <ProductsHeader
          eyebrow={level1.name}
          title={level2.name}
          count={products.total}
          countIsExact={products.totalIsExact}
        />
        <Level2PillRow
          categories={siblings}
          activeId={level2._id}
          onSelect={(c) => selectLevel2(c.slug)}
        />
        <Level3PillRow
          categories={pills}
          activeSlug={activeL3?.slug}
          onSelect={selectLevel3}
        />
      </View>

      <SavePrompt
        visible={wishlist.requiresSignIn}
        onDismiss={wishlist.dismissSignIn}
      />
      <SaveError message={wishlist.error} onDismiss={wishlist.dismissError} />

      {!point ? (
        <NeedsLocationState onRequest={() => void request()} denied={denied} />
      ) : products.coverageEmpty ? (
        // Distinct from "no products": nothing is wrong with the category, the
        // address is the problem. The old UI could not tell these apart and
        // showed one message for both.
        <CoverageEmptyState onChangeLocation={() => void request()} />
      ) : products.loadingInitial ? (
        // Loading and loaded are separate renders rather than one list fed
        // placeholder items. Faking list data means casting it to the real item
        // type, which turns off the type checker at exactly the point where a
        // wrong field name renders a blank card.
        <ProductGridSkeleton />
      ) : (
        <FlashList
          data={products.products}
          numColumns={2}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-10"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          onEndReachedThreshold={0.5}
          onEndReached={products.loadMore}
          renderItem={({ item, index }) => (
            // Manual gutter: FlashList v2 has no columnWrapper, and padding the
            // odd column keeps both cards the same width.
            <View
              className={
                index % 2 === 0 ? "pr-space-2 flex-1" : "pl-space-2 flex-1"
              }
            >
              <ProductCard
                product={item}
                quantityInCart={cart.quantityOf(item._id as Id<"products">)}
                saved={wishlist.isSaved(item._id)}
                onToggleSave={() =>
                  void wishlist.toggle(item._id as Id<"products">)
                }
                onPress={() => router.push(`/product/${item._id}`)}
                onAdd={() => cart.add(item._id as Id<"products">, 1)}
                onIncrement={() => cart.increment(item._id as Id<"products">)}
                onDecrement={() => cart.decrement(item._id as Id<"products">)}
              />
            </View>
          )}
          ListEmptyComponent={
            // Reachable only once the first page has RESOLVED and is empty.
            <NoProductsState
              categoryName={level2.name}
              onChangeLocation={() => void request()}
            />
          }
          ListFooterComponent={
            products.loadingMore ? (
              <View className="py-space-5 items-center">
                <Text size="caption" variant="subtle">
                  Loading more…
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Shown while the first page of products is in flight, with the pill rows and
 * header already on screen above it.
 */
function ProductGridSkeleton() {
  return (
    <View className="px-screen flex-row flex-wrap">
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          className={`mb-space-4 w-1/2 ${
            i % 2 === 0 ? "pr-space-2" : "pl-space-2"
          }`}
        >
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/**
 * Shown while the category tree resolves.
 *
 * Mirrors the real layout — a title block, a pill rail, then a 2-up grid — so
 * the screen does not visibly rearrange itself when data lands.
 */
function ProductsSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="gap-space-3 px-screen py-space-4">
        <View className="h-[44px]" />
        <View className="gap-space-2 flex-row">
          {Array.from({ length: 4 }, (_, i) => (
            <View
              key={i}
              className="h-control-sm rounded-pill bg-muted w-[84px]"
            />
          ))}
        </View>
      </View>
      <View className="px-screen flex-row flex-wrap">
        {Array.from({ length: 4 }, (_, i) => (
          <View
            key={i}
            className={`mb-space-4 w-1/2 ${
              i % 2 === 0 ? "pr-space-2" : "pl-space-2"
            }`}
          >
            <ProductCardSkeleton />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
