import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Heart } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

import { ScreenHeader } from "../components/screen-header";
import { ProductCard, ProductCardSkeleton } from "../components/product-card";
import { useCart } from "../providers/CartProvider";
import { useWishlist } from "../lib/use-wishlist";

/**
 * Saved items.
 *
 * ── Prices are read now, never remembered ────────────────────────────────
 *
 * The list stores product ids and nothing else; `catalog.productsByIds` supplies
 * name, price, image and stock on every open. A saved list that renders a price
 * captured when the item was saved is a pricing dispute with a date on it, and
 * the wishlist is the surface where the gap between save and purchase is longest.
 *
 * ── Unavailable items stay ───────────────────────────────────────────────
 *
 * An out-of-stock save is precisely what a saved list is for. It renders as
 * unbuyable rather than being hidden — hiding it looks like the app lost it.
 */
export default function SavedScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();

  const products = useQuery(
    api.data.catalog.productsByIds,
    wishlist.loaded && wishlist.count > 0
      ? { ids: [...wishlist.savedIds] as Id<"products">[] }
      : "skip",
  );

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Saved items" />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Heart size={36} color="#818A99" />
          <Text size="lg" weight="semibold" className="text-center">
            Sign in to save items
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Saved items follow your account, so they are there on your next
            visit and on your other devices.
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const loading = !wishlist.loaded || (wishlist.count > 0 && !products);

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title="Saved items"
        subtitle={
          wishlist.loaded
            ? `${wishlist.count} ${wishlist.count === 1 ? "item" : "items"}`
            : undefined
        }
      />

      {wishlist.error ? (
        <View className="px-screen pb-space-3">
          <View className="bg-destructive-soft p-space-3 rounded-md">
            <Text size="sm" variant="destructive">
              {wishlist.error}
            </Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View className="px-screen gap-space-4 flex-row">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ) : wishlist.count === 0 ? (
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Heart size={36} color="#818A99" />
          <Text size="lg" weight="semibold">
            Nothing saved yet
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Tap the heart on anything you want to come back to. Saving does not
            hold stock, so popular items can still sell out.
          </Text>
          <Button label="Start shopping" onPress={() => router.replace("/")} />
        </View>
      ) : (
        <FlashList
          data={products ?? []}
          numColumns={2}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-10"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          renderItem={({ item, index }) => (
            <View
              className={index % 2 === 0 ? "pr-space-2 flex-1" : "pl-space-2 flex-1"}
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
          ListFooterComponent={
            // Products that no longer exist are dropped by `productsByIds`
            // rather than erroring, so the count and the list can differ. Said
            // plainly instead of leaving the customer to notice.
            products && products.length < wishlist.count ? (
              <Text size="caption" variant="subtle" className="pt-space-4">
                {wishlist.count - products.length} saved{" "}
                {wishlist.count - products.length === 1 ? "item is" : "items are"}{" "}
                no longer in the catalogue.
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
