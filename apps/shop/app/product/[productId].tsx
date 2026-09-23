import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Share,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import BottomSheet, {
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Icon } from "../../components/icon";
import { CartIconButton } from "../../components/cart-icon-button";
import { SheetBackdrop } from "../../components/sheet-backdrop";
import { useTokenColors } from "../../lib/token-colors";

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
 *
 * ── A real bottom sheet, via @gorhom/bottom-sheet ───────────────────────────
 *
 * `app/_layout.tsx` presents this route as `transparentModal` +
 * `slide_from_bottom`, so the catalogue stays mounted behind it. `BottomSheet`
 * itself supplies the rest: the rounded card at a single snap point (`92%` of
 * the screen — "most of it", not all), the swipe-down-to-close gesture
 * (`enablePanDownToClose`), and the drag handle. `backdropComponent` is
 * `SheetBackdrop` (components/sheet-backdrop.tsx), not gorhom's own — theirs
 * fades in lockstep with the sheet's entire rise, which read as the dimming
 * itself sliding up together with the sheet; this one reaches full opacity
 * almost immediately instead. `onClose` fires for every dismissal path (the
 * close button via `sheetRef.close()`, the swipe, the backdrop tap, the OS
 * back gesture) and is the one place `router.back()` is called, so none of
 * them can disagree about whether the sheet or the route closed first.
 */
export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const cart = useCart();
  const wishlist = useWishlist();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  /** The pinned footer's real height, so the scroll can clear it. See its use. */
  const [footerHeight, setFooterHeight] = useState(0);
  const colors = useTokenColors();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["92%"], []);

  // ── The image gallery ──
  //
  // Matches the product card's carousel: every image, auto-advancing every
  // 2s, still manually swipeable. Width is measured on layout since it spans
  // whatever the sheet's own width turns out to be, not a fixed value.
  const [imageWidth, setImageWidth] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const galleryRef = useRef<BottomSheetScrollViewMethods>(null);

  const product = useQuery(
    api.data.products.getProductDetails,
    productId ? { productId: productId as Id<"products"> } : "skip",
  );
  const related = useQuery(
    api.data.products.getRelatedProducts,
    productId ? { productId: productId as Id<"products">, limit: 4 } : "skip",
  );

  const handleClose = () => sheetRef.current?.close();

  // The old screen never read `status`, so an Inactive or Archived product
  // rendered as fully buyable. `getRelatedProducts` filters on it; detail did
  // not — the two disagreed.
  const sellable = product
    ? product.status === "Active" && product.quantity > 0
    : false;
  const inBasket = product ? cart.quantityOf(product._id as Id<"products">) : 0;
  const images = product
    ? (product.images ?? []).filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];

  useEffect(() => {
    if (images.length <= 1 || imageWidth === 0) return;
    const timer = setInterval(() => {
      setActiveImage((prev) => {
        const next = (prev + 1) % images.length;
        galleryRef.current?.scrollTo({ x: next * imageWidth, animated: true });
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
    // `images` is a freshly filtered array every render; its length is the
    // real dependency, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, imageWidth]);

  const handleGalleryScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (imageWidth === 0) return;
    setActiveImage(Math.round(e.nativeEvent.contentOffset.x / imageWidth));
  };

  // Loading first, always. Conflating `undefined` with `null` is what made the
  // old screen spin forever on a deleted product.
  let body: ReactNode;
  if (product === undefined) {
    body = <ProductSkeleton />;
  } else if (product === null) {
    body = (
      <BottomSheetView style={{ flex: 1 }}>
        <NotFoundState what="product" onBack={() => router.replace("/")} />
      </BottomSheetView>
    );
  } else {
    body = (
      <>
        {/*
          A close X, not a back chevron — the top edge is the sheet's own
          handle/rounded corner, not the close affordance. The cart icon on
          the other side is the one place this screen lets a customer go
          straight to checkout without closing the sheet and hunting for
          basket access elsewhere first.
        */}
        <View className="px-screen pb-space-2 flex-row items-center justify-between">
          <CartIconButton plain />
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="size-control-sm rounded-pill items-center justify-center bg-gray-200 active:opacity-80"
          >
            <Icon name="close" size={18} tone="neutralIcon" />
          </Pressable>
        </View>

        {/*
          Padded by the footer's own measured height, not a constant.

          The constant here was 44, and the pinned footer is taller than that
          — a 48px control inside 12px of padding and a border, plus whatever
          the device's bottom inset adds. The difference was simply hidden
          underneath the bar: it clipped the bottom of the related-product
          cards, and with the description expanded it pushed the whole
          related rail into that dead zone, where it could not be scrolled
          into view at all and so looked like it had not rendered.

          Measuring is the fix rather than a bigger constant, because the
          footer's height is not a constant: it changes with the safe-area
          inset and with whether the basket control or the add button is in
          it. `|| 96` covers the first frame, before the footer has laid out.
        */}
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: (footerHeight || 96) + 24 }}
        >
          <View className="gap-space-1 px-screen pb-space-3">
            {product.vendor ? (
              <Text
                size="sm"
                weight="medium"
                variant="muted"
                style={{ color: colors.body }}
              >
                More from Blink
              </Text>
            ) : null}
            <Text size="h3" weight="bold" style={{ color: colors.strong }}>
              {product.name}
            </Text>
          </View>

          <View
            className="bg-muted aspect-[4/3] w-full"
            onLayout={(e) => setImageWidth(e.nativeEvent.layout.width)}
          >
            {images.length > 1 && imageWidth > 0 ? (
              <BottomSheetScrollView
                ref={galleryRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleGalleryScrollEnd}
                style={{ height: (imageWidth * 3) / 4 }}
              >
                {images.map((uri, index) => (
                  <OptimizedImage
                    key={index}
                    source={{ uri }}
                    contentFit="contain"
                    style={{ width: imageWidth, height: (imageWidth * 3) / 4 }}
                    className={`rounded-none ${sellable ? "" : "opacity-60"}`}
                    accessibilityIgnoresInvertColors
                  />
                ))}
              </BottomSheetScrollView>
            ) : images[0] ? (
              <OptimizedImage
                source={{ uri: images[0] }}
                contentFit="contain"
                className={`h-full w-full rounded-none ${
                  sellable ? "" : "opacity-60"
                }`}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Text
                  variant="subtle"
                  size="sm"
                  style={{ color: colors.subtle }}
                >
                  No image
                </Text>
              </View>
            )}

            {/*
              Share, over the image — in place of the wishlist heart on this
              screen. Saving is still reachable from every card (the grid,
              search, and the related-products rail below), so nothing is
              lost; this is the one place a customer is looking at a single
              product they might want to send to someone else.
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
              className="right-space-4 top-space-4 size-control rounded-pill absolute items-center justify-center bg-gray-200 opacity-90 active:opacity-70"
            >
              <Icon name="share-social-outline" size={20} tone="neutralIcon" />
            </Pressable>
          </View>

          {/* Gallery position, matching the product card's dot row. */}
          {images.length > 1 ? (
            <View className="gap-space-1 px-screen pt-space-2 flex-row">
              {images.map((_, index) => (
                <View
                  key={index}
                  className={`rounded-pill h-[4px] ${
                    index === activeImage
                      ? "bg-strong w-[10px]"
                      : "bg-border w-[4px]"
                  }`}
                />
              ))}
            </View>
          ) : null}

          <SavePrompt
            visible={wishlist.requiresSignIn}
            onDismiss={wishlist.dismissSignIn}
          />
          <SaveError
            message={wishlist.error}
            onDismiss={wishlist.dismissError}
          />

          <View className="gap-space-5 px-screen pt-space-5">
            <View className="gap-space-1">
              <View className="gap-space-2 flex-row flex-wrap items-center">
                <Text
                  size="priceLg"
                  weight="bold"
                  style={{ color: colors.strong }}
                >
                  {formatKES(product.price)}
                </Text>
                {product.hasDiscount ? (
                  <>
                    <Text
                      size="base"
                      variant="muted"
                      className="line-through"
                      style={{ color: colors.body }}
                    >
                      {formatKES(product.originalPrice)}
                    </Text>
                    <Text
                      size="sm"
                      weight="bold"
                      variant="destructive"
                      style={{ color: colors.destructive }}
                    >
                      {product.discountPercentage}% off
                    </Text>
                  </>
                ) : null}
              </View>
              <Text
                size="caption"
                variant="subtle"
                style={{ color: colors.subtle }}
              >
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
                    <Text
                      size="base"
                      weight="semibold"
                      style={{ color: colors.strong }}
                    >
                      Description
                    </Text>
                    <Icon
                      name={descriptionExpanded ? "remove" : "add"}
                      size={18}
                      tone="body"
                    />
                  </Pressable>
                  {descriptionExpanded ? (
                    <Text
                      size="sm"
                      variant="muted"
                      style={{ color: colors.body }}
                    >
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
                  <Text
                    size="base"
                    weight="semibold"
                    style={{ color: colors.strong }}
                  >
                    You might also like
                  </Text>
                  <BottomSheetScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 16 }}
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
                            // `replace`, not `push`: hopping through related
                            // products should not grow the sheet's own stack
                            // without bound.
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
                  </BottomSheetScrollView>
                </View>
              </>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </>
    );
  }

  const renderFooter = (props: BottomSheetFooterProps) =>
    product ? (
      <BottomSheetFooter {...props} bottomInset={0}>
        {/*
          Pinned bar. One control, not a stepper plus a separate button: not
          in the basket, it's a single "Add to basket" affordance; once it
          is, the same space becomes the add/remove toggle. Going to the
          basket itself is the cart tab's job, not this bar's.
        */}
        <View
          className="border-hairline px-screen py-space-4 flex-row items-center"
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={{
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          }}
        >
          {!sellable ? (
            /*
              Not a disabled button. A greyed-out control says "you may not do
              this" and leaves the customer to work out why; this says which
              of the two reasons it is. Same pill geometry as the `cta` Button
              so the bar does not change shape, in the warning surface rather
              than the brand one — it is a state, not something to press.
            */
            <View className="gap-space-2 bg-warning-soft h-12 flex-1 flex-row items-center justify-center rounded-[999px]">
              <Icon name="alert-circle" size={18} tone="warning" />
              <Text
                size="base"
                weight="semibold"
                className="text-warning-foreground"
              >
                {product.quantity <= 0 ? "Out of stock" : "Unavailable"}
              </Text>
            </View>
          ) : inBasket > 0 ? (
            // Same pill geometry as the "cta" Button size (h-12,
            // rounded-[999px]) so the control does not change shape when it
            // toggles between this and the plain Add button below.
            <View className="gap-space-3 bg-primary px-space-3 h-12 flex-1 flex-row items-center justify-between rounded-[999px]">
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
            <Button
              size="cta"
              full
              icon={<Icon name="add" size={20} tone="onBrand" />}
              label={`Add to basket · ${formatKES(product.price)}`}
              accessibilityLabel={`Add ${product.name} to basket`}
              onPress={() => cart.add(product._id as Id<"products">, 1)}
            />
          )}
        </View>
      </BottomSheetFooter>
    ) : null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      // v5 defaults this to true, which sizes the sheet to its content's
      // measured height instead of the snap point — that's what was
      // collapsing it down to ~30% right after the open animation reached
      // 92%. Explicit snapPoints means explicit sizing, not measured.
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={() => router.back()}
      backgroundStyle={{
        backgroundColor: colors.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      footerComponent={renderFooter}
      backdropComponent={(props) => (
        <SheetBackdrop
          {...props}
          onPress={handleClose}
          overlayColor={colors.overlay}
        />
      )}
    >
      {body}
    </BottomSheet>
  );
}

function ProductSkeleton() {
  return (
    <BottomSheetView style={{ flex: 1 }}>
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
    </BottomSheetView>
  );
}
