import { Pressable, View } from "react-native";
import { Heart, Minus, Plus } from "lucide-react-native";

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
  const inCart = quantityInCart > 0;
  const unit = unitLabel(product);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatKES(product.price)}${
        outOfStock ? ", out of stock" : ""
      }`}
      className={`border-hairline bg-card flex-1 overflow-hidden rounded-xl shadow-xs active:opacity-95 ${
        inCart ? "border-primary" : "border-border"
      }`}
    >
      <View className="bg-muted aspect-square w-full">
        {product.imageUrl ? (
          <OptimizedImage
            source={{ uri: product.imageUrl }}
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
            className="right-space-2 top-space-2 bg-card size-[34px] rounded-pill absolute items-center justify-center opacity-90 active:opacity-70"
          >
            <Heart
              size={17}
              color={saved === true ? "#D83A34" : "#5A6372"}
              fill={saved === true ? "#D83A34" : "transparent"}
            />
          </Pressable>
        ) : null}

        {/* At most one badge, by priority. */}
        <View className="left-space-2 top-space-2 absolute">
          {outOfStock ? (
            <Badge variant="secondary" label="Out of stock" />
          ) : lowStock ? (
            <Badge variant="warning" label={`Only ${product.quantity} left`} />
          ) : null}
        </View>

        {/*
          The add control lives HERE — over the image, never in the price row.
          Collapsed it is a 34px circle; expanded it is a stepper of the same
          height, still inside the image bounds, so nothing below it moves.
        */}
        {!outOfStock ? (
          <View className="bottom-space-2 right-space-2 absolute">
            {inCart ? (
              <View className="h-control-sm gap-space-1 rounded-pill bg-inverse px-space-1 flex-row items-center">
                <Pressable
                  onPress={onDecrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove one ${product.name}`}
                  hitSlop={6}
                  className="rounded-pill size-[26px] items-center justify-center active:opacity-70"
                >
                  <Minus size={16} color="#FFFFFF" />
                </Pressable>
                <Text
                  variant="onInverse"
                  size="label"
                  weight="semibold"
                  className="min-w-[16px] text-center"
                >
                  {quantityInCart}
                </Text>
                <Pressable
                  onPress={onIncrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Add another ${product.name}`}
                  hitSlop={6}
                  // Cannot exceed what the shop actually has.
                  disabled={quantityInCart >= product.quantity}
                  className="rounded-pill size-[26px] items-center justify-center active:opacity-70 disabled:opacity-40"
                >
                  <Plus size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name} to basket`}
                hitSlop={6}
                className="size-control-sm rounded-pill bg-inverse items-center justify-center shadow-md active:scale-[0.94]"
              >
                <Plus size={18} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      <View className="gap-space-1 p-space-3">
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
          <Text variant="price" size="price">
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
