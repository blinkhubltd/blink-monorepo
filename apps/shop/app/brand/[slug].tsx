import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { usePagedBrandProducts } from "../../lib/use-paged-products";
import { useLocation } from "../../providers/LocationProvider";
import { useCart } from "../../providers/CartProvider";
import { useWishlist } from "../../lib/use-wishlist";
import {
  ProductCard,
  ProductCardSkeleton,
} from "../../components/product-card";
import { ScreenHeader } from "../../components/screen-header";
import { CartIconButton } from "../../components/cart-icon-button";
import { Icon } from "../../components/icon";
import { SaveError, SavePrompt } from "../../components/save-prompt";
import {
  CoverageEmptyState,
  NeedsLocationState,
  NoProductsState,
  NotFoundState,
} from "../../components/states";

/**
 * Everything one brand sells, near you. URL `/brand/[slug]`.
 *
 * ── Why this screen exists ────────────────────────────────────────────────
 *
 * It is where a brand banner lands. Before it, a "brand" was a string printed
 * on a product card, so a brand banner in the admin had nowhere to point and
 * was decoration — the customer tapped it and nothing happened.
 *
 * Keyed by slug rather than id, matching the category routes: the URL is
 * shareable and legible, and the admin's brand form shows the customer-facing
 * path it is about to create.
 *
 * Deliberately NOT under `(tabs)/(home)`: a brand is reached from a banner
 * rather than by browsing the category tree, so it is a pushed screen with a
 * back button rather than a node in the tab's own history.
 */
export default function BrandScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const brand = useQuery(api.data.brands.getBrandBySlug, { slug });
  const { point, denied, request } = useLocation();
  const cart = useCart();
  const wishlist = useWishlist();

  const products = usePagedBrandProducts({
    brandId: brand?._id ?? null,
    point,
  });

  // `undefined` is "still asking" and must not render as "no such brand" —
  // the same guard order the category screen documents.
  if (brand === undefined) return <BrandSkeleton />;
  if (brand === null) {
    return <NotFoundState what="brand" onBack={() => router.replace("/")} />;
  }

  const countLabel =
    products.total === null
      ? null
      : products.totalIsExact
        ? `${products.total} ${products.total === 1 ? "item" : "items"}`
        : `${products.total}+ items`;

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Brand"
        title={brand.name}
        meta={countLabel ?? undefined}
        right={<CartIconButton plain />}
      />

      <View className="px-screen py-space-3 gap-space-3 flex-row items-center">
        {brand.logoUrl ? (
          <OptimizedImage
            source={{ uri: brand.logoUrl }}
            contentFit="contain"
            className="size-[52px] rounded-pill"
            accessibilityLabel={brand.name}
          />
        ) : (
          <View className="bg-accent size-[52px] rounded-pill items-center justify-center">
            <Icon name="storefront-outline" size={22} tone="brand" />
          </View>
        )}
        {brand.description ? (
          <Text size="sm" variant="muted" numberOfLines={3} className="flex-1">
            {brand.description}
          </Text>
        ) : (
          <Text size="sm" variant="muted" className="flex-1">
            Everything from {brand.name}, from shops that deliver to you.
          </Text>
        )}
      </View>

      <SavePrompt
        visible={wishlist.requiresSignIn}
        onDismiss={wishlist.dismissSignIn}
      />
      <SaveError message={wishlist.error} onDismiss={wishlist.dismissError} />

      {!point ? (
        <NeedsLocationState onRequest={() => void request()} denied={denied} />
      ) : products.coverageEmpty ? (
        <CoverageEmptyState onChangeLocation={() => void request()} />
      ) : products.loadingInitial ? (
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
            <NoProductsState
              categoryName={brand.name}
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

function BrandSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="gap-space-3 px-screen py-space-4">
        <View className="h-[44px]" />
        <View className="gap-space-3 flex-row items-center">
          <View className="bg-muted size-[52px] rounded-pill" />
          <View className="bg-muted h-[14px] flex-1 rounded-sm" />
        </View>
      </View>
      <ProductGridSkeleton />
    </SafeAreaView>
  );
}
