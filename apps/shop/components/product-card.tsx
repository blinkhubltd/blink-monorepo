import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Icon } from "./icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { formatKES } from "../lib/format";

/**
 * A product in the grid.
 *
 * Replaces `ProductCard.tsx` and `AddToCartBadge.tsx` with one card and one add
 * control, and fixes three things about the pair it replaces.
 *
 * ── 1. The price no longer disappears when the item is in the basket ──────
 *
 * The old card put the add control *inside the price row* and let it expand to
 * `flex-1` once it became a stepper, so the price was pushed out and hidden —
 * exactly when the customer most wants to check what they are being charged
 * (`{!isInCart && formatKES(product.price)}` was literally the condition).
 *
 * Here the add control floats over the bottom-right of the *image*, and the
 * price row beneath it is inviolate. A side benefit: the stepper is a discrete
 * 34px control rather than "the whole bottom strip of the card", so it is much
 * harder to change quantity when you meant to open the product.
 *
 * ── 2. contentFit is `contain`, not `cover` ──────────────────────────────
 *
 * Packaged retail goods are tall bottles and wide boxes. `cover` crops the
 * label, which is the one thing the shopper is actually reading.
 *
 * ── 3. One badge, not a stack ─────────────────────────────────────────────
 *
 * The old card could render "Featured" and "Hot 🔥" simultaneously, shifting the
 * second one down to `top-10`. Two badges that mean nothing in particular is
 * noise; this shows at most one, by priority.
 *
 * ── 4. The stepper is a transient reveal, not a permanent state ────────────
 *
 * Tapping "+" adds one and shows the −/qty/+ stepper for 3 seconds, then it
 * collapses back to a plain "+" — regardless of whether the item is still in
 * the basket. This is `showStepper`, local and separate from `quantityInCart`:
 * the stepper is a momentary affordance for the tap that just happened, not a
 * standing readout of basket contents — that readout is the basket itself.
 */

export type ProductForCard = {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  unit_value?: number;
  unit_type?: string;
  requires_prescription?: boolean;
  imageUrl: string | null;
  /** Every resolved image, for the auto-scrolling gallery. Falls back to `imageUrl` when absent. */
  images?: string[];
};

/** At or below this, the card says how few are left. */
const LOW_STOCK_THRESHOLD = 5;

function unitLabel(product: ProductForCard): string | null {
  if (!product.unit_value && !product.unit_type) return null;
  return [product.unit_value, product.unit_type].filter(Boolean).join(" ");
}

export function ProductCard({
  product,
  quantityInCart,
  onPress,
  onAdd,
  onIncrement,
  onDecrement,
  saved,
  onToggleSave,
}: {
  product: ProductForCard;
  quantityInCart: number;
  onPress: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  /**
   * Whether this product is on the customer's saved list. `undefined` means the
   * answer has not arrived yet, and the heart stays neutral rather than drawing
   * as unsaved — which is what made a saved product flash empty on every mount
   * in the app this replaces, and unsave itself if tapped in that window.
   */
  saved?: boolean;
  /** Omit to hide the heart entirely — the related rail on detail does. */
  onToggleSave?: () => void;
}) {
  const outOfStock = product.quantity <= 0;
  const lowStock = !outOfStock && product.quantity <= LOW_STOCK_THRESHOLD;
  const unit = unitLabel(product);
  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : product.imageUrl
        ? [product.imageUrl]
        : [];

  const [showStepper, setShowStepper] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-scrolling image gallery ──
  //
  // Only wired up when there is more than one image — a single-image card
  // pays none of this cost. Width is measured on layout rather than assumed,
  // since the card's width depends on the grid it's placed in.
  const [imageWidth, setImageWidth] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const galleryRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (gallery.length <= 1 || imageWidth === 0) return;
    const timer = setInterval(() => {
      setActiveImage((prev) => {
        const next = (prev + 1) % gallery.length;
        galleryRef.current?.scrollTo({ x: next * imageWidth, animated: true });
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [gallery.length, imageWidth]);

  const handleGalleryScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (imageWidth === 0) return;
    setActiveImage(
      Math.round(e.nativeEvent.contentOffset.x / imageWidth),
    );
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const revealStepper = () => {
    setShowStepper(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowStepper(false), 3000);
  };

  const handleAdd = () => {
    onAdd();
    revealStepper();
  };

  const handleIncrement = () => {
    onIncrement();
    revealStepper();
  };

  const handleDecrement = () => {
    onDecrement();
    if (quantityInCart <= 1) {
      // Going to zero — nothing left for the stepper to show.
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowStepper(false);
    } else {
      revealStepper();
    }
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatKES(product.price)}${
        outOfStock ? ", out of stock" : ""
      }`}
      className="border-hairline border-border bg-card flex-1 overflow-hidden rounded-lg shadow-xs active:opacity-95"
    >
      <View
        className="bg-muted aspect-square w-full"
        onLayout={(e) => setImageWidth(e.nativeEvent.layout.width)}
      >
        {gallery.length > 1 && imageWidth > 0 ? (
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleGalleryScrollEnd}
            style={{ height: imageWidth }}
          >
            {gallery.map((uri, index) => (
              <OptimizedImage
                key={index}
                source={{ uri }}
                contentFit="contain"
                style={{ width: imageWidth, height: imageWidth }}
                className={`p-space-3 rounded-none ${
                  outOfStock ? "opacity-60" : ""
                }`}
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : gallery[0] ? (
          <OptimizedImage
            source={{ uri: gallery[0] }}
            contentFit="contain"
            className={`p-space-3 h-full w-full rounded-none ${
              outOfStock ? "opacity-60" : ""
            }`}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text size="caption" variant="subtle">
              No image
            </Text>
          </View>
        )}

        {/*
          Saving, top-right. A translucent circle over the image rather than a
          row below it, so it costs no vertical space and cannot be hit while
          reaching for the add control in the opposite corner.
        */}
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            accessibilityRole="button"
            accessibilityState={{ selected: saved === true }}
            accessibilityLabel={
              saved === true
                ? `Remove ${product.name} from saved items`
                : `Save ${product.name}`
            }
            hitSlop={6}
            className="right-space-2 top-space-2 bg-card size-[34px] rounded-pill shadow-xs absolute items-center justify-center opacity-90 active:opacity-70"
          >
            {/*
              A different glyph, not a `fill` prop: Ionicons has no fill, so
              filled-ness is `heart` against `heart-outline`.

              Three states, not two. `saved` is undefined until the wishlist
              query resolves, and it renders as the subtle outline so "unknown"
              reads as neither saved nor explicitly unsaved — previously
              undefined was indistinguishable from false.

              The saved colour was #D83A34, which is in no palette; `destructive`
              is #E23B33.
            */}
            <Icon
              name={saved === true ? "heart" : "heart-outline"}
              size={17}
              tone={
                saved === true ? "destructive" : saved === false ? "body" : "subtle"
              }
            />
          </Pressable>
        ) : null}

        {/* At most one badge, by priority. */}
        <View className="left-space-2 top-space-2 absolute">
          {outOfStock ? (
            <Badge variant="secondary" label="Out of stock" />
          ) : lowStock ? (
            <Badge
              variant="warning"
              label={`Only ${product.quantity} left`}
              className="px-space-2 py-0"
            />
          ) : null}
        </View>

        {/*
          The add control lives HERE — over the image, never in the price row.
          Collapsed it is a 34px circle; expanded it is a stepper of the same
          height, still inside the image bounds, so nothing below it moves.
        */}
        {!outOfStock ? (
          <View className="bottom-space-2 right-space-2 absolute">
            {showStepper ? (
              <View className="h-control-sm gap-space-1 rounded-pill bg-primary px-space-1 flex-row items-center">
                <Pressable
                  onPress={handleDecrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove one ${product.name}`}
                  hitSlop={6}
                  className="rounded-pill size-[26px] items-center justify-center active:opacity-70"
                >
                  <Icon name="remove" size={16} tone="onBrand" />
                </Pressable>
                <Text
                  variant="onBrand"
                  size="label"
                  weight="semibold"
                  className="min-w-[16px] text-center"
                >
                  {quantityInCart}
                </Text>
                <Pressable
                  onPress={handleIncrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Add another ${product.name}`}
                  hitSlop={6}
                  // Cannot exceed what the shop actually has.
                  disabled={quantityInCart >= product.quantity}
                  className="rounded-pill size-[26px] items-center justify-center active:opacity-70 disabled:opacity-40"
                >
                  <Icon name="add" size={16} tone="onBrand" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleAdd}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to basket`}
                hitSlop={6}
                className="size-control-sm rounded-pill bg-primary items-center justify-center shadow-md active:scale-[0.94]"
              >
                <Icon name="add" size={18} tone="onBrand" />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      <View className="gap-space-1 p-space-3">
        {/*
          Gallery position, left-aligned below the image — not overlaid on it,
          so it never competes with the save/add controls for a tap target.
        */}
        {gallery.length > 1 ? (
          <View className="gap-space-1 pb-space-1 flex-row">
            {gallery.map((_, index) => (
              <View
                key={index}
                className={`h-[4px] rounded-pill ${
                  index === activeImage ? "w-[10px] bg-strong" : "w-[4px] bg-border"
                }`}
              />
            ))}
          </View>
        ) : null}

        {/*
          Fixed height on the name so cards align across a row whether the name
          wraps to one line or two.
        */}
        <Text
          size="sm"
          weight="medium"
          numberOfLines={2}
          className="min-h-[38px]"
        >
          {product.name}
        </Text>
        <Text size="caption" variant="subtle" numberOfLines={1}>
          {unit ?? " "}
        </Text>

        {/* The inviolate row. Price is always here, basket or no basket. */}
        <View className="gap-space-2 flex-row items-center justify-between">
          <Text variant="price" size="price" className="text-black">
            {formatKES(product.price)}
          </Text>
          {product.requires_prescription ? (
            <Badge variant="info" label="Rx" />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Matches the real card's geometry exactly, so arrival shifts nothing. */
export function ProductCardSkeleton() {
  return (
    <View className="border-hairline border-border bg-card flex-1 overflow-hidden rounded-xl">
      <Skeleton className="aspect-square w-full rounded-none" />
      <View className="gap-space-2 p-space-3">
        <Skeleton className="h-[13px] w-full rounded-sm" />
        <Skeleton className="h-[13px] w-2/3 rounded-sm" />
        <Skeleton className="h-[11px] w-1/3 rounded-sm" />
        <Skeleton className="h-[17px] w-1/2 rounded-sm" />
      </View>
    </View>
  );
}
