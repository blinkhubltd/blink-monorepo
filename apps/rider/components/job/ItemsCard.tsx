import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { ItemList, itemCountLabel } from "./ItemList";
import { formatMoney } from "../../lib/format";
import type { DeliveryItem } from "../../lib/data/types";

/**
 * What is in the bag, and how it is paid for.
 *
 * The design's "2 bags" and "1 chilled" tags are not drawn: nothing in the
 * order records bag count or temperature, and a tag that is sometimes right
 * teaches a rider to ignore it on the day it matters.
 */
export function ItemsCard({
  items,
  itemCount,
  paymentLabel,
  total,
}: {
  items: DeliveryItem[];
  itemCount: number;
  paymentLabel: string;
  total: number;
}) {
  return (
    <View className="gap-space-4 rounded-lg border border-border bg-card p-space-5">
      <Text size="h4" weight="bold" className="text-strong">
        {itemCountLabel(itemCount)}
      </Text>
      {items.length > 0 ? <ItemList items={items} /> : null}
      <View className="flex-row items-center justify-between border-t border-border pt-space-4">
        <Text size="sm" variant="subtle" className="flex-1 pr-space-3">
          {paymentLabel}
        </Text>
        <Text weight="bold" className="text-[18px] leading-[24px] text-price">
          {formatMoney(total)}
        </Text>
      </View>
    </View>
  );
}
