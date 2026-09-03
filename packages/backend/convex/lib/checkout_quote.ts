import {
  apportion,
  priceBasketDelivery,
  priceClearanceDelivery,
  type DeliveryPricingSettings,
} from "./delivery_fee";

/**
 * The priced basket — computed once, stored, and replayed.
 *
 * ── Why a stored quote rather than recomputing ───────────────────────────
 *
 * Payment is authorised at initiation; orders are written after Paystack
 * confirms. Those are two separate moments, and the basket can change between
 * them — a price edit, a stock drop, another device.
 *
 * Recomputing at finalisation writes an order whose total no longer matches the
 * amount already charged, which breaks reconciliation silently and in a way
 * nobody notices until a customer complains. Refusing to write the orders is
 * worse: the payment is captured and the customer has nothing.
 *
 * So the basket is priced ONCE, the result is stored on the payment row, the
 * customer is charged exactly that, and finalisation writes orders from the
 * stored quote without re-deriving anything. The race stops being a case to
 * handle and becomes impossible by construction. It also makes a retried
 * finalisation idempotent: it replays identical numbers rather than re-pricing
 * against a basket that may since have emptied.
 *
 * Everything needed to write the orders lives in here, because at finalisation
 * the cart may legitimately be gone.
 */

/** One line, priced at the moment the customer agreed to it. */
export interface QuoteLine {
  productId: string;
  vendorId: string;
  name: string;
  quantity: number;
  /** Unit price AS QUOTED. Not re-read later — this is what was agreed. */
  unitPrice: number;
  lineTotal: number;
  requiresPrescription: boolean;
  /**
   * Clearance metadata, present only on clearance lines.
   *
   * Carried on the quote rather than re-read at finalisation for the same
   * reason the price is: `clearance_order_items` records what the customer was
   * shown, and a listing whose discount is edited afterwards must not rewrite
   * the receipt.
   */
  originalPrice?: number;
  discountPercentage?: number;
  sku?: string;
  unitType?: string;
  unitValue?: number;
}

export interface QuoteLeg {
  vendorId: string;
  subtotal: number;
  /** This leg's apportioned share. The legs sum to `deliveryFee` exactly. */
  deliveryFee: number;
  total: number;
  lines: QuoteLine[];
}

export interface CheckoutQuote {
  subtotal: number;
  /** Before the free-delivery waiver, so a receipt can show the saving. */
  grossDeliveryFee: number;
  deliveryFee: number;
  freeDeliveryApplied: boolean;
  /** Recorded so a later settings change cannot make a past order look wrong. */
  freeDeliveryThreshold: number;
  /** No tax is applied. Recorded explicitly rather than left implicit — see below. */
  tax: number;
  total: number;
  legs: QuoteLeg[];
  requiresPrescription: boolean;
  vendorCount: number;
  itemCount: number;
  /**
   * True for a clearance basket.
   *
   * Stored so finalisation knows which tables to write — clearance lines become
   * `clearance_order_items` and their orders carry `is_clearance` — without
   * having to re-read the products it was built from, which at finalisation may
   * no longer exist.
   */
  isClearance?: boolean;
}

/** A basket line resolved against its current product row. */
export interface ResolvedLine {
  productId: string;
  vendorId: string | undefined;
  name: string;
  quantity: number;
  price: number;
  status: string;
  available: number;
  requiresPrescription: boolean;
  /** Clearance only. See the note on `QuoteLine`. */
  originalPrice?: number;
  discountPercentage?: number;
  sku?: string;
  unitType?: string;
  unitValue?: number;
}

export class QuoteError extends Error {}

/** Lines grouped per vendor, plus the per-vendor subtotals, sellable only. */
interface Grouped {
  byVendor: Map<string, QuoteLine[]>;
  legSubtotals: { vendorId: string; subtotal: number }[];
}

/**
 * The part both builders share: drop what cannot be sold, cap each line at what
 * the shop actually has, and group by vendor.
 *
 * Shared rather than duplicated because the regular and clearance baskets must
 * agree on what "available" means. Two copies would drift the first time one of
 * them was taught about a new status.
 */
function groupSellable(lines: ResolvedLine[]): Grouped {
  if (lines.length === 0) {
    throw new QuoteError("Your basket is empty");
  }

  // Unsellable lines are dropped rather than failing the whole checkout: the
  // customer keeps what they can still buy. The caller reports which were
  // dropped so the screen can say so - silently removing an item the customer
  // chose would be worse than either alternative.
  const sellable = lines.filter(
    (l) => l.status === "Active" && l.available > 0 && !!l.vendorId,
  );
  if (sellable.length === 0) {
    throw new QuoteError("Nothing in your basket is available right now");
  }

  const byVendor = new Map<string, QuoteLine[]>();
  for (const line of sellable) {
    // Never quote more than the shop has. Capping here rather than rejecting
    // means a customer whose basket outran stock still checks out, with the
    // reduced quantity visible in the quote they approve.
    const quantity = Math.min(line.quantity, line.available);
    if (quantity <= 0) continue;

    const quoteLine: QuoteLine = {
      productId: line.productId,
      vendorId: line.vendorId!,
      name: line.name,
      quantity,
      unitPrice: line.price,
      lineTotal: line.price * quantity,
      requiresPrescription: line.requiresPrescription,
      ...(line.originalPrice !== undefined
        ? { originalPrice: line.originalPrice }
        : {}),
      ...(line.discountPercentage !== undefined
        ? { discountPercentage: line.discountPercentage }
        : {}),
      ...(line.sku !== undefined ? { sku: line.sku } : {}),
      ...(line.unitType !== undefined ? { unitType: line.unitType } : {}),
      ...(line.unitValue !== undefined ? { unitValue: line.unitValue } : {}),
    };
    const existing = byVendor.get(line.vendorId!);
    if (existing) existing.push(quoteLine);
    else byVendor.set(line.vendorId!, [quoteLine]);
  }

  if (byVendor.size === 0) {
    throw new QuoteError("Nothing in your basket is available right now");
  }

  return {
    byVendor,
    legSubtotals: [...byVendor.entries()].map(([vendorId, vendorLines]) => ({
      vendorId,
      subtotal: vendorLines.reduce((sum, l) => sum + l.lineTotal, 0),
    })),
  };
}

/** Assemble legs from grouped lines and a per-vendor fee allocation. */
function assembleLegs(
  grouped: Grouped,
  feeByVendor: Map<string, number>,
): QuoteLeg[] {
  return grouped.legSubtotals.map(({ vendorId, subtotal }) => {
    const deliveryFee = feeByVendor.get(vendorId) ?? 0;
    return {
      vendorId,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      lines: grouped.byVendor.get(vendorId)!,
    };
  });
}

function countItems(legs: QuoteLeg[]): number {
  return legs.reduce(
    (sum, leg) => sum + leg.lines.reduce((n, l) => n + l.quantity, 0),
    0,
  );
}

/**
 * Price a resolved basket.
 *
 * Pure: the caller does the database reads and hands the result in, which is
 * what makes every rule below testable without a Convex context.
 *
 * -- Tax ------------------------------------------------------------------
 *
 * Zero, and recorded as a field rather than omitted. The two apps disagreed:
 * `cart.getCartSummary` used `taxRate = 0.0` while the old checkout divided by
 * 1.16 to back VAT out of a VAT-inclusive price. Storing an explicit `tax: 0`
 * makes the current answer legible, so whoever settles the VAT question can see
 * what was assumed rather than inferring it from an absence.
 */
export function buildQuote(
  lines: ResolvedLine[],
  settings: DeliveryPricingSettings,
): CheckoutQuote {
  const grouped = groupSellable(lines);

  const priced = priceBasketDelivery(grouped.legSubtotals, settings);
  const legs = assembleLegs(
    grouped,
    new Map(priced.legs.map((l) => [l.vendorId, l.delivery_fee])),
  );

  const quote: CheckoutQuote = {
    subtotal: priced.basketSubtotal,
    grossDeliveryFee: priced.grossDeliveryFee,
    deliveryFee: priced.basketDeliveryFee,
    freeDeliveryApplied: priced.waived,
    freeDeliveryThreshold: settings.freeThreshold,
    tax: 0,
    total: priced.basketSubtotal + priced.basketDeliveryFee,
    legs,
    requiresPrescription: legs.some((leg) =>
      leg.lines.some((l) => l.requiresPrescription),
    ),
    vendorCount: legs.length,
    itemCount: countItems(legs),
  };

  assertQuoteBalances(quote);
  return quote;
}

/**
 * Price a resolved CLEARANCE basket.
 *
 * Same grouping and the same balance assertion, with one deliberate difference:
 * the free-delivery threshold does not apply. Clearance items are already
 * discounted and waiving delivery on top erodes the margin twice, so
 * `priceClearanceDelivery` takes no subtotal - the threshold cannot leak in.
 *
 * `freeDeliveryThreshold` is recorded as 0, meaning "no waiver was available",
 * rather than recording a threshold that was never consulted and inviting a
 * later reader to conclude the customer missed out on one.
 */
export function buildClearanceQuote(
  lines: ResolvedLine[],
  settings: { baseFee: number; extraVendorFee: number },
): CheckoutQuote {
  const grouped = groupSellable(lines);

  const basketSubtotal = grouped.legSubtotals.reduce(
    (sum, leg) => sum + leg.subtotal,
    0,
  );
  const deliveryFee =
    basketSubtotal > 0
      ? priceClearanceDelivery(grouped.legSubtotals.length, settings)
      : 0;

  // Apportioned by the same largest-remainder rule as the regular basket, so
  // the legs sum to the basket fee exactly and a partial refund returns a
  // sensible share.
  const allocated = apportion(
    Math.round(deliveryFee * 100),
    grouped.legSubtotals.map((leg) => Math.max(0, Math.round(leg.subtotal))),
    grouped.legSubtotals.map((leg) => leg.vendorId),
  );
  const feeByVendor = new Map(
    grouped.legSubtotals.map((leg, i) => [leg.vendorId, allocated[i]! / 100]),
  );

  const legs = assembleLegs(grouped, feeByVendor);

  const quote: CheckoutQuote = {
    subtotal: basketSubtotal,
    // Gross equals net: there is no waiver to show a saving against.
    grossDeliveryFee: deliveryFee,
    deliveryFee,
    freeDeliveryApplied: false,
    freeDeliveryThreshold: 0,
    tax: 0,
    total: basketSubtotal + deliveryFee,
    legs,
    requiresPrescription: legs.some((leg) =>
      leg.lines.some((l) => l.requiresPrescription),
    ),
    vendorCount: legs.length,
    itemCount: countItems(legs),
    isClearance: true,
  };

  assertQuoteBalances(quote);
  return quote;
}

/**
 * The arithmetic closes.
 *
 * Checked at build time rather than trusted, because this number is charged to
 * a card. A quote whose legs do not sum to its total would over- or under-charge
 * by the difference, and nothing downstream would notice: finalisation writes
 * whatever the legs say while Paystack captured whatever the total said.
 */
export function assertQuoteBalances(quote: CheckoutQuote): void {
  const legSubtotal = quote.legs.reduce((sum, l) => sum + l.subtotal, 0);
  if (Math.round(legSubtotal) !== Math.round(quote.subtotal)) {
    throw new QuoteError(
      `Quote does not balance: legs sum to ${legSubtotal}, subtotal is ${quote.subtotal}`,
    );
  }

  const legFees = quote.legs.reduce((sum, l) => sum + l.deliveryFee, 0);
  if (Math.round(legFees) !== Math.round(quote.deliveryFee)) {
    throw new QuoteError(
      `Delivery fee does not balance: legs sum to ${legFees}, basket fee is ${quote.deliveryFee}`,
    );
  }

  const expected = quote.subtotal + quote.tax + quote.deliveryFee;
  if (Math.round(expected) !== Math.round(quote.total)) {
    throw new QuoteError(
      `Total does not balance: expected ${expected}, quote says ${quote.total}`,
    );
  }
}

/** Minor units, for Paystack and for any integer comparison of money. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Whether the customer is being charged what they were shown.
 *
 * Compared in integer minor units. Float equality on money is how a 0.01
 * discrepancy becomes a support ticket nobody can reproduce.
 */
export function quoteMatchesExpected(
  quote: CheckoutQuote,
  expectedTotal: number | undefined,
): boolean {
  if (expectedTotal === undefined) return true;
  return toMinorUnits(quote.total) === toMinorUnits(expectedTotal);
}

/**
 * What changed between the basket the customer approved and the one now priced.
 *
 * Returned to the client so the confirmation can name the differences rather
 * than showing a new number and hoping nobody notices.
 */
export function describeQuoteChanges(
  previous: CheckoutQuote,
  next: CheckoutQuote,
): string[] {
  const changes: string[] = [];

  const before = new Map(
    previous.legs.flatMap((l) => l.lines.map((n) => [n.productId, n])),
  );
  const after = new Map(
    next.legs.flatMap((l) => l.lines.map((n) => [n.productId, n])),
  );

  for (const [productId, line] of before) {
    const now = after.get(productId);
    if (!now) {
      changes.push(`${line.name} is no longer available`);
      continue;
    }
    if (now.unitPrice !== line.unitPrice) {
      changes.push(`${line.name} changed price`);
    }
    if (now.quantity !== line.quantity) {
      changes.push(`${line.name} is limited to ${now.quantity}`);
    }
  }

  if (
    toMinorUnits(previous.deliveryFee) !== toMinorUnits(next.deliveryFee) &&
    changes.length === 0
  ) {
    // Only worth saying on its own; otherwise it is a consequence of the
    // line changes already listed.
    changes.push("The delivery fee changed");
  }

  return changes;
}
