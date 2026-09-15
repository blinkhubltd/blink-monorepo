import { useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Icon } from "../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { useCart } from "../../providers/CartProvider";
import { NotFoundState } from "../../components/states";
import { ProductCard } from "../../components/product-card";
import { formatKES } from "../../lib/format";
import { useWishlist } from "../../lib/use-wishlist";
import { SaveError, SavePrompt } from "../../components/save-prompt";

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
 * ── The discount row is real, even though nothing feeds it yet ────────────
 *
 * `getProductDetails` returns `hasDiscount: false`, `discountPercentage: 0` and
 * `originalPrice === price` as hardcoded stubs (real discounts exist today only
 * on the separate clearance catalogue) — so the strike-through/percent-off row
 * below is gated on `product.hasDiscount` and renders nothing right now. That is
 * a property of the data, not of this screen: the layout is ready the moment a
 * real discount exists, rather than needing to be built twice.
 *
 * ── No "Customizable" badge, no delivery-window text ───────────────────────
 *
 * Both appear in some reference retail apps' product screens. Neither has
 * backing data here — there is no per-product "customizable" flag and no
 * per-product delivery-window estimate computed anywhere in this app — so
 * showing either would be inventing information, not presenting it.
 */
export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const cart = useCart();
  const wishlist = useWishlist();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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
      {/*
        A close X, not a back chevron — this screen reads as a sheet over the
        catalogue now, matching the reference design, even though it is still
        the same shareable/deep-linkable route underneath (see the file
        comment above). No cart icon here: the pinned bottom bar already is
        the add-to-cart affordance, and the reference has none either.
      */}
      <View className="px-screen pt-space-3 flex-row justify-end">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="size-control-sm rounded-pill bg-inverse items-center justify-center active:opacity-80"
        >
          <Icon name="close" size={18} tone="onInverse" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-space-11">
        <View className="gap-space-1 px-screen pb-space-3">
          {product.vendor ? (
            <Text size="sm" weight="medium" variant="muted">
              More from Blink
            </Text>
          ) : null}
          <Text size="h3" weight="bold">
            {product.name}
          </Text>
        </View>

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

          {/*
            Share, over the image — in place of the wishlist heart on this
            screen. Saving is still reachable from every card (the grid,
            search, and the related-products rail below), so nothing is lost;
            this is the one place a customer is looking at a single product
            they might want to send to someone else.
          */}
          <Pressable
            onPress={() =>
              void Share.share({
                message: `Check out ${product.name} on Blink: https://blink.app/product/${product._id}`,
                url: `https://blink.app/product/${product._id}`,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Share this product"
            hitSlop={8}
            className="right-space-4 top-space-4 bg-inverse size-control rounded-pill absolute items-center justify-center opacity-90 active:opacity-70"
          >
            <Icon name="share-social-outline" size={20} tone="onInverse" />
          </Pressable>
        </View>

        <SavePrompt
          visible={wishlist.requiresSignIn}
          onDismiss={wishlist.dismissSignIn}
        />
        <SaveError message={wishlist.error} onDismiss={wishlist.dismissError} />

        <View className="gap-space-5 px-screen pt-space-5">
          <View className="gap-space-1">
            <View className="gap-space-2 flex-row flex-wrap items-center">
              <Text variant="price" size="priceLg">
                {formatKES(product.price)}
              </Text>
              {product.hasDiscount ? (
                <>
                  <Text size="base" variant="muted" className="line-through">
                    {formatKES(product.originalPrice)}
                  </Text>
                  <Text size="sm" weight="bold" variant="destructive">
                    {product.discountPercentage}% off
                  </Text>
                </>
              ) : null}
            </View>
            <Text size="caption" variant="subtle">
              Including VAT
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

          {product.unit_value || product.unit_type || product.vendor ? (
            <View className="gap-space-3 flex-row">
              {product.unit_value || product.unit_type ? (
                <View className="bg-secondary gap-space-1 p-space-3 flex-1 rounded-md">
                  <Text size="caption" variant="subtle">
                    Pack Size
                  </Text>
                  <Text size="sm" weight="semibold">
                    {[product.unit_value, product.unit_type]
                      .filter(Boolean)
                      .join(" ")}
                  </Text>
                </View>
              ) : null}
              {product.vendor ? (
                <View className="bg-secondary gap-space-1 p-space-3 flex-1 rounded-md">
                  <Text size="caption" variant="subtle">
                    Sold &amp; Shipped
                  </Text>
                  <Text size="sm" weight="semibold" numberOfLines={1}>
                    Blink
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {product.description ? (
            <>
              <Separator />
              <View className="gap-space-3">
                <Pressable
                  onPress={() => setDescriptionExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: descriptionExpanded }}
                  className="flex-row items-center justify-between"
                >
                  <Text size="base" weight="semibold">
                    Description
                  </Text>
                  <Icon
                    name={descriptionExpanded ? "remove" : "add"}
                    size={18}
                    tone="body"
                  />
                </Pressable>
                {descriptionExpanded ? (
                  <Text size="sm" variant="muted">
                    {product.description}
                  </Text>
                ) : null}
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
                          images: (item.images ?? []).filter(
                            (u): u is string => typeof u === "string",
                          ),
                        }}
                        quantityInCart={cart.quantityOf(
                          item._id as Id<"products">,
                        )}
                        saved={wishlist.isSaved(item._id)}
                        onToggleSave={() =>
                          void wishlist.toggle(item._id as Id<"products">)
                        }
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

      {/*
        Pinned bar. One control, not a stepper plus a separate button: not in
        the basket, it's a single "Add to basket" affordance; once it is, the
        same space becomes the add/remove toggle. Going to the basket itself
        is the cart tab's job, not this bar's.
      */}
      <View className="border-hairline border-border bg-card px-screen py-space-4 flex-row items-center">
        {!sellable ? (
          <Button size="lg" full disabled label="Unavailable" />
        ) : inBasket > 0 ? (
          <View className="h-control-lg gap-space-3 bg-primary px-space-3 flex-1 flex-row items-center justify-between rounded-md">
            <Pressable
              onPress={() => cart.decrement(product._id as Id<"products">)}
              accessibilityRole="button"
              accessibilityLabel={`Remove one ${product.name}`}
              hitSlop={8}
              className="rounded-pill size-[36px] items-center justify-center active:opacity-70"
            >
              <Icon name="remove" size={20} tone="onBrand" />
            </Pressable>
            <Text variant="onBrand" size="base" weight="semibold">
              {inBasket} in basket · {formatKES(product.price * inBasket)}
            </Text>
            <Pressable
              onPress={() => cart.increment(product._id as Id<"products">)}
              accessibilityRole="button"
              accessibilityLabel={`Add another ${product.name}`}
              hitSlop={8}
              // Cannot exceed what the shop actually has.
              disabled={inBasket >= product.quantity}
              className="rounded-pill size-[36px] items-center justify-center active:opacity-70 disabled:opacity-40"
            >
              <Icon name="add" size={20} tone="onBrand" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => cart.add(product._id as Id<"products">, 1)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to basket`}
            className="h-control-lg gap-space-2 bg-primary flex-1 flex-row items-center justify-center rounded-md active:opacity-90"
          >
            <Icon name="add" size={20} tone="onBrand" />
            <Text variant="onBrand" size="base" weight="semibold">
              Add to basket · {formatKES(product.price)}
            </Text>
          </Pressable>
        )}
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
