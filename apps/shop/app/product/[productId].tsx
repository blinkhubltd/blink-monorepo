import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { useCart } from "../../providers/CartProvider";
import { ScreenHeader } from "../../components/screen-header";
import { NotFoundState } from "../../components/states";
import { ProductCard } from "../../components/product-card";
import { formatKES } from "../../lib/format";

/**
 * Product detail. URL `/product/[productId]`.
 *
 * The route is `/product/...` rather than the old `/product-details/...`, which
 * incidentally **fixes the share link**: the old screen built
 * `https://blink.app/product/${id}` while its own route was
 * `/product-details/[id]`, so every shared link 404'd. The Android
 * `intentFilters` already declare `/product`, so deep links now resolve.
 *
 * Nine defects in the 816-line screen this replaces are fixed rather than
 * carried. The three that were invisible:
 *
 *   1. **The "not found" branch was unreachable.** `if (!productDetails)` caught
 *      `undefined` (loading) AND `null` (missing), so the later
 *      `productDetails === null` check never ran and a bad id spun on
 *      "Loading product..." forever. Loading and absent are separate states
 *      here, checked in that order — the same rule that fixed the refresh bug.
 *   2. **The price preview read "KES 1".**
 *      `formatKES(price * itemQuantity || quantity)` parses as
 *      `(price * itemQuantity) || quantity`, so with the item not yet in the
 *      basket it rendered the *quantity* as a price.
 *   3. **Adding double-counted.** With the item already in the basket the
 *      stepper wrote through to the server, then "Add to Cart" sent the local
 *      quantity and the backend ADDED it — a line at 5 became 6. The basket API
 *      is absolute now, not a delta, so that class is gone.
 *
 * Also: no discount UI. `getProductDetails` returns `hasDiscount: false`,
 * `discountPercentage: 0` and `originalPrice === price` as hardcoded stubs, so a
 * strike-through would print the same number twice.
 */
export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const cart = useCart();

  const product = useQuery(
    api.data.products.getProductDetails,
    productId ? { productId: productId as Id<"products"> } : "skip",
  );
  const related = useQuery(
    api.data.products.getRelatedProducts,
    productId ? { productId: productId as Id<"products">, limit: 4 } : "skip",
  );

  // Loading first, always. Conflating `undefined` with `null` is what made the
  // old screen spin forever on a deleted product.
  if (product === undefined) return <ProductSkeleton />;
  if (product === null) {
    return <NotFoundState what="product" onBack={() => router.replace("/")} />;
  }

  // The old screen never read `status`, so an Inactive or Archived product
  // rendered as fully buyable. `getRelatedProducts` filters on it; detail did
  // not — the two disagreed.
  const sellable = product.status === "Active" && product.quantity > 0;
  const inBasket = cart.quantityOf(product._id as Id<"products">);
  const images = (product.images ?? []).filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader eyebrow={product.category?.name} title={product.name} />

      <ScrollView contentContainerClassName="pb-space-11">
        <View className="bg-muted aspect-[4/3] w-full">
          {images[0] ? (
            <OptimizedImage
              source={{ uri: images[0] }}
              contentFit="contain"
              className={`p-space-6 h-full w-full rounded-none ${
                sellable ? "" : "opacity-60"
              }`}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Text variant="subtle" size="sm">
                No image
              </Text>
            </View>
          )}
        </View>

        <View className="gap-space-5 px-screen pt-space-5">
          <View className="gap-space-2">
            {product.unit_value || product.unit_type ? (
              <Text size="sm" variant="muted">
                {[product.unit_value, product.unit_type]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
            ) : null}
            {/* No strike-through: originalPrice always equals price. */}
            <Text variant="price" size="priceLg">
              {formatKES(product.price)}
            </Text>
          </View>

          <View className="gap-space-2 flex-row flex-wrap">
            {!sellable ? (
              <Badge variant="secondary" label="Currently unavailable" />
            ) : product.isLowStock ? (
              <Badge
                variant="warning"
                label={`Only ${product.quantity} left`}
              />
            ) : (
              <Badge variant="success" label="In stock" />
            )}
            {product.requires_prescription ? (
              <Badge variant="info" label="Prescription needed" />
            ) : null}
          </View>

          {product.requires_prescription ? (
            <View className="bg-warning-soft p-space-4 gap-space-1 rounded-md">
              <Text size="sm" weight="semibold">
                This item needs a valid prescription
              </Text>
              <Text size="sm">
                You will be asked to upload one at checkout before it can be
                dispatched.
              </Text>
            </View>
          ) : null}

          {product.vendor ? (
            <>
              <Separator />
              <View className="gap-space-1">
                <Text size="caption" variant="eyebrow">
                  Sold by
                </Text>
                <Text size="base" weight="semibold">
                  {product.vendor.name}
                </Text>
              </View>
            </>
          ) : null}

          {product.description ? (
            <>
              <Separator />
              <View className="gap-space-2">
                <Text size="base" weight="semibold">
                  About this item
                </Text>
                <Text size="sm" variant="muted">
                  {product.description}
                </Text>
              </View>
            </>
          ) : null}

          {related && related.length > 0 ? (
            <>
              <Separator />
              <View className="gap-space-3">
                <Text size="base" weight="semibold">
                  You might also like
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-space-4"
                >
                  {related.map((item) => (
                    // The same card as the grid, at a fixed width. One card
                    // component, two contexts.
                    <View key={item._id} className="w-[156px]">
                      <ProductCard
                        product={{
                          _id: item._id,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity,
                          unit_value: item.unit_value,
                          unit_type: item.unit_type,
                          requires_prescription: item.requires_prescription,
                          imageUrl:
                            (item.images ?? []).find(
                              (u): u is string => typeof u === "string",
                            ) ?? null,
                        }}
                        quantityInCart={cart.quantityOf(
                          item._id as Id<"products">,
                        )}
                        onPress={() =>
                          // `replace`, not `push`: the old screen pushed, so
                          // hopping through related products grew the stack
                          // without bound and back never reached the category.
                          router.replace(`/product/${item._id}`)
                        }
                        onAdd={() => cart.add(item._id as Id<"products">, 1)}
                        onIncrement={() =>
                          cart.increment(item._id as Id<"products">)
                        }
                        onDecrement={() =>
                          cart.decrement(item._id as Id<"products">)
                        }
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned bar. Guests see the identical control — the gate is checkout. */}
      <View className="border-hairline border-border bg-card px-screen py-space-4 gap-space-3 flex-row items-center">
        {inBasket > 0 ? (
          <View className="h-control gap-space-2 bg-muted px-space-3 flex-row items-center rounded-md">
            <Button
              variant="ghost"
              size="iconSm"
              label="−"
              onPress={() => cart.decrement(product._id as Id<"products">)}
            />
            <Text
              size="base"
              weight="semibold"
              className="min-w-[24px] text-center"
            >
              {inBasket}
            </Text>
            <Button
              variant="ghost"
              size="iconSm"
              label="+"
              disabled={inBasket >= product.quantity}
              onPress={() => cart.increment(product._id as Id<"products">)}
            />
          </View>
        ) : null}

        <Button
          size="lg"
          full={inBasket === 0}
          className={inBasket > 0 ? "flex-1" : undefined}
          disabled={!sellable}
          label={
            !sellable
              ? "Unavailable"
              : inBasket > 0
                ? `In basket · ${formatKES(product.price * inBasket)}`
                : `Add to basket · ${formatKES(product.price)}`
          }
          onPress={() =>
            inBasket > 0
              ? router.push("/cart")
              : cart.add(product._id as Id<"products">, 1)
          }
        />
      </View>
    </SafeAreaView>
  );
}

function ProductSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/4 rounded-sm" />
        <Skeleton className="h-[28px] w-3/4 rounded-sm" />
      </View>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <View className="px-screen pt-space-5 gap-space-3">
        <Skeleton className="h-[24px] w-1/3 rounded-sm" />
        <Skeleton className="rounded-pill h-[20px] w-1/4" />
        <Skeleton className="h-[15px] w-full rounded-sm" />
        <Skeleton className="h-[15px] w-5/6 rounded-sm" />
      </View>
    </SafeAreaView>
  );
}
