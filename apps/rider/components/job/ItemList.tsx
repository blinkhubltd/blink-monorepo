import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { formatMoney } from "../../lib/format";
import type { DeliveryItem } from "../../lib/data/types";

/** The bag's contents: a quantity tile, the name, the line total. */
export function ItemList({ items }: { items: DeliveryItem[] }) {
  return (
    <View className="gap-space-4">
      {items.map((item, i) => (
        <View key={`${item.name}-${i}`} className="flex-row items-center gap-space-4">
          <View className="size-[34px] items-center justify-center rounded-[10px] bg-secondary">
            <Text size="sm" weight="bold" className="text-foreground">
              {item.quantity}
            </Text>
          </View>
          <Text size="sm" className="flex-1 text-strong">
            {item.name}
          </Text>
          <Text size="sm" className="text-foreground">
            {formatMoney(item.total)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
