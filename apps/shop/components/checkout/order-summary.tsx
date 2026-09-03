import { View } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Badge } from "@repo/mobile-ui/components/ui/badge";

import { formatKES } from "../../lib/format";

/**
 * What the customer is being charged, and why.
 *
 * ── Every figure comes from the server quote ─────────────────────────────
 *
 * The screen this replaces derived its money three different ways and showed
 * two of them at once: a headline `Total` that counted one 200 delivery fee for
 * the whole basket, and a `Combined Total` summing per-vendor orders that each
 * carried a full 200. A three-shop basket displayed two totals differing by 400
 * on the same screen, and Paystack was charged the smaller one — so the orders
 * created always summed to more than the money taken.
 *
 * There is one number here now, and it is the number that will be charged.
 *
 * ── The VAT decomposition is kept ────────────────────────────────────────
 *
 * Prices are VAT-inclusive, so this splits the subtotal into the ex-VAT amount
 * and the 16% component. It is informational — `tax_amount` on the order is
 * zero, because the tax is already inside the price rather than added to it.
 * Retained because a customer who saw it before would notice its absence, and
 * because a VAT-registered buyer needs the figure.
 */

const VAT_RATE = 0.16;

export interface QuoteForDisplay {
  subtotal: number;
  deliveryFee: number;
  grossDeliveryFee: number;
  freeDeliveryApplied: boolean;
  freeDeliveryThreshold: number;
  total: number;
  vendorCount: number;
  itemCount: number;
  legs: Array<{
    vendorId: string;
    subtotal: number;
    deliveryFee: number;
    total: number;
    lines: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      requiresPrescription: boolean;
    }>;
  }>;
}

export function OrderSummary({
  quote,
  unavailable,
}: {
  quote: QuoteForDisplay;
  unavailable: string[];
}) {
  // A decomposition of a VAT-inclusive price, not an addition to it:
  // exVat + vat === subtotal.
  const exVat = quote.subtotal / (1 + VAT_RATE);
  const vat = quote.subtotal - exVat;

  return (
    <View className="gap-space-4">
      <Text size="base" weight="semibold">
        Order summary
      </Text>

      {/*
        Lines are grouped by shop, which the old screen did not show at all —
        it listed every product in one block while silently creating one order
        per shop. If the basket becomes several deliveries, the customer should
        see that before they pay, not discover it in their order history.
      */}
      {quote.legs.map((leg, index) => (
        <View
          key={leg.vendorId}
          className="border-hairline border-border gap-space-2 p-space-4 rounded-lg"
        >
          {quote.legs.length > 1 ? (
            <View className="gap-space-2 flex-row items-center justify-between">
              <Text size="caption" variant="eyebrow">
                Delivery {index + 1} of {quote.legs.length}
              </Text>
              <Text size="caption" variant="subtle">
                {formatKES(leg.total)}
              </Text>
            </View>
          ) : null}

          {leg.lines.map((line) => (
            <View
              key={line.productId}
              className="gap-space-3 flex-row items-start justify-between"
            >
              <View className="gap-space-2 flex-1 flex-row items-start">
                <Text size="sm" variant="muted">
                  {line.quantity}×
                </Text>
                <View className="gap-space-1 flex-1">
                  <Text size="sm" numberOfLines={2}>
                    {line.name}
                  </Text>
                  {line.requiresPrescription ? (
                    <Badge variant="info" label="Rx" />
                  ) : null}
                </View>
              </View>
              {/*
                A per-line price, which the old screen showed for clearance
                items and omitted for everything else — so a customer checking
                one item against the total could not.
              */}
              <Text size="sm" weight="medium">
                {formatKES(line.lineTotal)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {unavailable.length > 0 ? (
        <View className="bg-warning-soft p-space-4 gap-space-1 rounded-md">
          <Text size="sm" weight="semibold">
            Some items were removed
          </Text>
          {unavailable.map((message) => (
            <Text key={message} size="sm">
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      <Separator />

      <SummaryRow label="Subtotal (excl. VAT)" value={formatKES(exVat)} />
      <SummaryRow label={`VAT (${VAT_RATE * 100}%)`} value={formatKES(vat)} />
      <SummaryRow label="Subtotal" value={formatKES(quote.subtotal)} />

      <SummaryRow
        label={
          quote.vendorCount > 1
            ? `Delivery (${quote.vendorCount} shops)`
            : "Delivery"
        }
        value={
          quote.freeDeliveryApplied && quote.deliveryFee === 0
            ? "Free"
            : formatKES(quote.deliveryFee)
        }
      />

      {quote.freeDeliveryApplied ? (
        <Text size="caption" variant="success">
          Free delivery applied — you saved{" "}
          {formatKES(quote.grossDeliveryFee - quote.deliveryFee)}.
        </Text>
      ) : quote.freeDeliveryThreshold > 0 ? (
        <Text size="caption" variant="subtle">
          Spend {formatKES(quote.freeDeliveryThreshold - quote.subtotal)} more
          for free delivery.
        </Text>
      ) : null}

      {quote.vendorCount > 1 ? (
        <Text size="caption" variant="subtle">
          One delivery fee for the basket, plus a pickup charge for each extra
          shop.
        </Text>
      ) : null}

      <Separator />

      <View className="gap-space-3 flex-row items-baseline justify-between">
        <Text size="lg" weight="semibold">
          Total
        </Text>
        <Text variant="price" size="priceLg">
          {formatKES(quote.total)}
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-space-3 flex-row items-baseline justify-between">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
    </View>
  );
}
