import { Text as RNText, View } from "react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";

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
 *
 * ── Rows, not boxes ──────────────────────────────────────────────────────
 *
 * Every line is one flat row at the design's body size — label left, value
 * right — because the card this sits in is already the container. The
 * per-shop bordered boxes it had before nested a card inside a card, which is
 * what made this section read as heavier than the four above it.
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
    <>
      {quote.legs.map((leg, index) => (
        <View key={leg.vendorId} className="gap-[12px]">
          {/*
            Named only when there is more than one — which the old screen never
            showed at all. It listed every product in one block while silently
            creating one order per shop, so a basket that was about to become
            several deliveries looked like one.
          */}
          {quote.legs.length > 1 ? (
            <SummaryRow
              label={`Delivery ${index + 1} of ${quote.legs.length}`}
              value={formatKES(leg.total)}
            />
          ) : null}

          {leg.lines.map((line) => (
            <SummaryRow
              key={line.productId}
              // A per-line price, which the old screen showed for clearance
              // items and omitted for everything else — so a customer checking
              // one item against the total could not.
              label={`${line.quantity}× ${line.name}${
                line.requiresPrescription ? " (Rx)" : ""
              }`}
              value={formatKES(line.lineTotal)}
            />
          ))}
        </View>
      ))}

      {unavailable.length > 0 ? (
        <View className="bg-warning-soft gap-space-1 rounded-[14px] p-[14px]">
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

      <Divider />

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
        <RNText className="text-success font-sans text-[13px] leading-[19px]">
          Free delivery applied — you saved{" "}
          {formatKES(quote.grossDeliveryFee - quote.deliveryFee)}.
        </RNText>
      ) : quote.freeDeliveryThreshold > 0 ? (
        <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
          Spend {formatKES(quote.freeDeliveryThreshold - quote.subtotal)} more
          for free delivery.
        </RNText>
      ) : null}

      {quote.vendorCount > 1 ? (
        <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
          One delivery fee for the basket, plus a pickup charge for each extra
          shop.
        </RNText>
      ) : null}

      <Divider />

      <SummaryRow label="Total" value={formatKES(quote.total)} strong />
    </>
  );
}

function Divider() {
  return <View className="bg-border h-[1px]" />;
}

/**
 * One line of the summary.
 *
 * Plain `RNText` at explicit px rather than the `Text` scale: this is a money
 * table, and every row in it — including the total — has to sit on the same
 * grid as the pinned footer's figure.
 */
function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const font = strong
    ? "font-semibold text-[16px] leading-[23px]"
    : "font-sans text-[14px] leading-[21px]";
  return (
    <View className="gap-space-4 flex-row items-baseline justify-between">
      <RNText className={`text-foreground shrink ${font}`} numberOfLines={2}>
        {label}
      </RNText>
      <RNText className={`text-foreground ${font}`}>{value}</RNText>
    </View>
  );
}
