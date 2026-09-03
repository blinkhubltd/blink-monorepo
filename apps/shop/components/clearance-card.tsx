import { Pressable, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { formatKES } from "../lib/format";
import { describeExpiry } from "../lib/clearance";

/**
 * A clearance deal in the grid.
 *
 * Deliberately NOT the catalogue card with a discount badge bolted on. Two
 * differences are load-bearing:
 *
 *  1. **The strike-through is real here.** The catalogue card shows no original
 *     price because `getProductDetails` hardcodes `hasDiscount: false` and
 *     `originalPrice === price`, so a strike-through there would print the same
 *     number twice. A clearance listing carries a genuine `original_price` and
 *     `discount_percentage`, so the saving can be shown honestly.
 *
 *  2. **Expiry is on the card.** A clearance item is discounted *because* it is
 *     close to its date, and that is the single most important thing a buyer
 *     needs to know before adding it. Burying it on the detail screen is how a
 *     customer discovers it on the doorstep instead.
 */

export type ClearanceForCard = {
  _id: string;
  name: string;
  original_price: number;
  clearance_price: number;
  discount_percentage: number;
  quantity: number;
  expiry_date?: number;
  display_end_date: number;
  imageUrl: string | null;
  vendor?: { name: string } | null;
};

export function ClearanceCard({
  deal,
  quantityInBasket,
  onPress,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  deal: ClearanceForCard;
  quantityInBasket: number;
  onPress: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const soldOut = deal.quantity <= 0;
  const inBasket = quantityInBasket > 0;
  const expiry = describeExpiry(deal.expiry_date, deal.display_end_date);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${deal.name}, ${formatKES(deal.clearance_price)}, was ${formatKES(deal.original_price)}${
        soldOut ? ", sold out" : ""
      }`}
      className={`border-hairline bg-card flex-1 overflow-hidden rounded-xl shadow-xs active:opacity-95 ${
        inBasket ? "border-primary" : "border-border"
      }`}
    >
      <View className="bg-muted aspect-square w-full">
        {deal.imageUrl ? (
          <OptimizedImage
            source={{ uri: deal.imageUrl }}
            contentFit="contain"
            className={`p-space-3 h-full w-full rounded-none ${
              soldOut ? "opacity-60" : ""
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

        {/* The discount, which is the reason the customer is on this screen. */}
        <View className="left-space-2 top-space-2 absolute">
          {soldOut ? (
            <Badge variant="secondary" label="Sold out" />
          ) : (
            <Badge
              variant="destructive"
              label={`-${Math.round(deal.discount_percentage)}%`}
            />
          )}
        </View>

        {!soldOut ? (
          <View className="bottom-space-2 right-space-2 absolute">
            {inBasket ? (
              <View className="h-control-sm gap-space-1 rounded-pill bg-inverse px-space-1 flex-row items-center">
                <Pressable
                  onPress={onDecrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove one ${deal.name}`}
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
                  {quantityInBasket}
                </Text>
                <Pressable
                  onPress={onIncrement}
                  accessibilityRole="button"
                  accessibilityLabel={`Add another ${deal.name}`}
                  hitSlop={6}
                  disabled={quantityInBasket >= deal.quantity}
                  className="rounded-pill size-[26px] items-center justify-center active:opacity-70 disabled:opacity-40"
                >
                  <Plus size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={`Add ${deal.name}`}
                hitSlop={6}
                className="bg-primary size-control-sm rounded-pill items-center justify-center active:opacity-80"
              >
                <Plus size={20} color="#0A0E16" />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      <View className="gap-space-1 p-space-3">
        <Text size="sm" weight="medium" numberOfLines={2}>
          {deal.name}
        </Text>

        {/* Expiry before price: it is why the price is what it is. */}
        <Text
          size="caption"
          variant={expiry.urgent ? "destructive" : "subtle"}
          weight={expiry.urgent ? "semibold" : "regular"}
        >
          {expiry.label}
        </Text>

        <View className="gap-space-2 flex-row items-baseline">
          <Text variant="price" size="price">
            {formatKES(deal.clearance_price)}
          </Text>
          {/* A real saving, not a stub: this table carries both prices. */}
          {deal.original_price > deal.clearance_price ? (
            <Text size="caption" variant="subtle" className="line-through">
              {formatKES(deal.original_price)}
            </Text>
          ) : null}
        </View>

        {deal.quantity > 0 && deal.quantity <= 5 ? (
          <Text size="caption" variant="destructive">
            Only {deal.quantity} left
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ClearanceCardSkeleton() {
  return (
    <View className="border-hairline border-border bg-card flex-1 overflow-hidden rounded-xl">
      <Skeleton className="aspect-square w-full rounded-none" />
      <View className="gap-space-2 p-space-3">
        <Skeleton className="h-[13px] w-full rounded-sm" />
        <Skeleton className="h-[11px] w-1/2 rounded-sm" />
        <Skeleton className="h-[17px] w-2/3 rounded-sm" />
      </View>
    </View>
  );
}
