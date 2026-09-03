import { Pressable, View } from "react-native";
import { Minus, Plus, Trash2 } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { formatKES } from "../lib/format";

/**
 * One line in the basket.
 *
 * Two things the screen this replaces got wrong:
 *
 *   - **No stock ceiling.** Its `+` called `handleUpdateQuantity(id, qty + 1)`
 *     unconditionally, so a customer could add fifty of something the shop had
 *     three of and only find out at checkout. The `+` here disables at
 *     `available`, and the line says why.
 *   - **Unsellable lines looked identical to sellable ones.** A product that had
 *     gone inactive or out of stock since it was added still rendered with a
 *     price and counted toward the total. Here it is visibly struck out, does
 *     not count, and offers removal.
 */

export interface BasketLine {
  product: string;
  quantity: number;
  name: string;
  price: number;
  imageUrl: string | null;
  isPurchasable: boolean;
  available: number;
  requiresPrescription: boolean;
}

export function BasketLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: BasketLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  const atStockLimit = line.quantity >= line.available;

  return (
    <View className="gap-space-3 px-screen py-space-4 flex-row">
      <View className="bg-muted size-[72px] overflow-hidden rounded-md">
        {line.imageUrl ? (
          <OptimizedImage
            source={{ uri: line.imageUrl }}
            contentFit="contain"
            className={`p-space-2 h-full w-full rounded-none ${
              line.isPurchasable ? "" : "opacity-50"
            }`}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>

      <View className="gap-space-1 flex-1">
        <View className="gap-space-2 flex-row items-start justify-between">
          <Text
            size="sm"
            weight="medium"
            numberOfLines={2}
            className={`flex-1 ${line.isPurchasable ? "" : "line-through opacity-60"}`}
          >
            {line.name}
          </Text>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${line.name}`}
            hitSlop={8}
            className="active:opacity-60"
          >
            <Trash2 size={18} color="#818A99" />
          </Pressable>
        </View>

        {!line.isPurchasable ? (
          <Badge variant="secondary" label="No longer available" />
        ) : line.requiresPrescription ? (
          <Badge variant="info" label="Needs a prescription" />
        ) : atStockLimit ? (
          // Said here rather than silently disabling the button, so a customer
          // who taps + and sees nothing happen knows why.
          <Text size="caption" variant="subtle">
            Only {line.available} available
          </Text>
        ) : null}

        <View className="gap-space-3 flex-row items-center justify-between">
          <Text
            variant={line.isPurchasable ? "price" : "subtle"}
            size="price"
            className={line.isPurchasable ? "" : "line-through"}
          >
            {formatKES(line.price * line.quantity)}
          </Text>

          {line.isPurchasable ? (
            <View className="h-control-sm gap-space-1 rounded-pill bg-muted px-space-1 flex-row items-center">
              <Pressable
                onPress={onDecrement}
                accessibilityRole="button"
                accessibilityLabel={`Remove one ${line.name}`}
                hitSlop={6}
                className="rounded-pill size-[26px] items-center justify-center active:opacity-70"
              >
                <Minus size={16} color="#0A0E16" />
              </Pressable>
              <Text
                size="label"
                weight="semibold"
                className="min-w-[20px] text-center"
              >
                {line.quantity}
              </Text>
              <Pressable
                onPress={onIncrement}
                accessibilityRole="button"
                accessibilityLabel={`Add another ${line.name}`}
                hitSlop={6}
                disabled={atStockLimit}
                className="rounded-pill size-[26px] items-center justify-center active:opacity-70 disabled:opacity-30"
              >
                <Plus size={16} color="#0A0E16" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
