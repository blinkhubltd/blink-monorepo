import { View } from "react-native";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { Screen } from "../Screen";
import { CustomerCard } from "./CustomerCard";
import { DetailHeader } from "./DetailHeader";
import { ItemsCard } from "./ItemsCard";
import { formatDuration } from "../../lib/earnings";
import { formatClock, formatDay, formatMoney } from "../../lib/format";
import type { DeliveryDetail } from "../../lib/data/types";

/**
 * A delivered order, as a record: how long it took, when each thing happened,
 * who it went to and how they rated it, what was in it, and what it paid.
 *
 * ── What the design shows that this does not ─────────────────────────────
 *
 *   "Picked up at hub" / "On the way" timeline rows — a shipment keeps its
 *     creation time and its last update, nothing between, so those two
 *     moments were never recorded. The timeline shows what was.
 *   The rating's quoted comment — ratings are a number; there is no comment.
 *   Distance bonus and customer tip — neither exists in the data model. The
 *     payout is the delivery fee, which is what the rider is actually paid.
 *   "Paid to M-Pesa Friday" — the payout day is a platform setting this app
 *     cannot read, so the line does not name one.
 *   "Report a problem" — there is no reporting flow for a button to open.
 */
export function DeliveredView({ detail }: { detail: DeliveryDetail }) {
  const now = Date.now();
  const deliveredAt = detail.updatedAt;
  const took =
    deliveredAt !== null && detail.assignedAt !== null
      ? deliveredAt - detail.assignedAt
      : null;

  const timeline = [
    detail.orderDate !== null
      ? { label: "Order placed", at: detail.orderDate }
      : null,
    detail.assignedAt !== null
      ? { label: "Assigned to you", at: detail.assignedAt }
      : null,
    deliveredAt !== null ? { label: "Delivered", at: deliveredAt } : null,
  ]
    .filter((row): row is { label: string; at: number } => row !== null)
    .sort((a, b) => a.at - b.at);

  return (
    <View className="flex-1 bg-background">
      <DetailHeader
        title={`Order #${detail.reference}`}
        subtitle={deliveredAt !== null ? formatDay(deliveredAt, now) : null}
      />
      <Screen>
        <View className="gap-[14px] pb-space-7 pt-space-3">
          {/* Mode-fixed ink: the gold check has to read on it day and night. */}
          <View className="flex-row items-center gap-space-4 rounded-lg bg-on-brand-pill p-space-5 dark:border dark:border-border">
            <View className="size-[42px] items-center justify-center rounded-pill bg-primary">
              <Icon name="checkmark-circle" size={22} tone="onBrand" />
            </View>
            <View className="flex-1">
              <Text size="h4" weight="bold" className="text-white">
                {took !== null && took > 0
                  ? `Delivered in ${formatDuration(took)}`
                  : "Delivered"}
              </Text>
              {deliveredAt !== null ? (
                <Text size="sm" className="text-white/75">
                  {detail.verified
                    ? `Code confirmed at ${formatClock(deliveredAt)}`
                    : `Handed over at ${formatClock(deliveredAt)}`}
                </Text>
              ) : null}
            </View>
          </View>

          {timeline.length > 0 ? (
            <View className="gap-[14px] rounded-lg border border-border bg-card p-space-5">
              <Text size="h4" weight="bold" className="text-strong">
                Timeline
              </Text>
              {timeline.map((row) => (
                <View key={row.label} className="flex-row items-center gap-space-4">
                  <View className="size-[9px] rounded-pill bg-strong" />
                  <Text size="sm" className="flex-1 text-strong">
                    {row.label}
                  </Text>
                  <Text size="sm" variant="subtle">
                    {formatClock(row.at)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <CustomerCard
            name={detail.customerName}
            phone={detail.customerPhone}
            address={detail.addressLine}
            showContact={false}
          >
            {detail.rating !== null ? (
              <View className="flex-row items-center gap-[10px] border-t border-border pt-[14px]">
                <Icon name="star" size={17} tone="price" />
                <Text size="sm" className="flex-1 text-strong">
                  Rated {detail.rating.toFixed(1)} by the customer
                </Text>
              </View>
            ) : null}
          </CustomerCard>

          <ItemsCard
            items={detail.items}
            itemCount={detail.itemCount}
            paymentLabel={detail.paymentLabel}
            total={detail.total}
          />

          <View className="gap-[10px] rounded-lg border border-border bg-card p-space-5">
            <Text size="h4" weight="bold" className="text-strong">
              Your payout
            </Text>
            <View className="flex-row items-center justify-between gap-space-4">
              <Text size="sm" className="text-foreground">
                Delivery fee
              </Text>
              <Text size="sm" weight="semibold" className="text-strong">
                {formatMoney(detail.fee)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between gap-space-4 border-t border-border pt-space-4">
              <Text size="sm" variant="subtle" className="flex-1">
                Paid to your payout account
              </Text>
              <Text weight="bold" className="text-[20px] leading-[26px] text-price">
                {formatMoney(detail.fee)}
              </Text>
            </View>
          </View>
        </View>
      </Screen>
    </View>
  );
}
