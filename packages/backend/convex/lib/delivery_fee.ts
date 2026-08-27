/**
 * Delivery pricing — the single authority for what a basket is charged.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * Three implementations disagreed, and only one of them was even reachable:
 *
 *   - `data/cart.ts` `getCartSummary` hardcoded `subtotal >= 2000 ? 0 : 250`.
 *     It is the only place the 2,000 threshold or the 250 fee existed anywhere
 *     — and no screen calls it, so the basket never showed a delivery fee at
 *     all. Free delivery was never actually offered to anyone.
 *   - `blink-ecommerce/app/checkout.tsx:393` charged a flat
 *     `delivery_fee ?? 200` with no threshold logic. This is what customers
 *     actually paid.
 *   - `data/orders.ts:1341-1379` recomputed for clearance only, with its own
 *     duplicate `parseNonNegative` defaults of 150/50.
 *
 * Pure, ctx-free and `_generated`-free so it can be tested directly and used
 * from a query, a mutation, and the client without three copies drifting —
 * the same reason `lib/geo.ts` and `lib/catalog_scope.ts` are shaped this way.
 * No `Date.now()`: nothing here depends on the clock.
 *
 * ── The formula ──────────────────────────────────────────────────────────
 *
 *     gross  = base + extraVendorFee * (N - 1)        // N = distinct vendors
 *     waived = basketSubtotal >= freeThreshold
 *     fee    = gross - (waived ? base : 0)
 *
 *          basket | 1 shop | 2 shops | 4 shops
 *           1,900 |    200 |     250 |     350
 *           2,000 |      0 |      50 |     150
 *
 * Three deliberate properties:
 *
 *   - **`base + extra * (N-1)`, not `base * N`.** A two-shop basket pays 250,
 *     not 400. This is already the clearance formula, so both paths agree
 *     instead of the customer paying for a vendor split they never chose.
 *   - **The waiver caps at one base fee.** Above the threshold the customer
 *     stops paying `base` but still covers extra pickups, bounding exposure at
 *     `base` per order rather than `base * N`. A four-shop basket at exactly
 *     2,000 costs 150 rather than waiving 800 on a 2,000 sale.
 *   - **Clearance is excluded** — those items are already discounted, and
 *     stacking free delivery erodes the margin twice. Asserted by test so the
 *     two basket types stay explicitly different rather than accidentally so.
 *
 * The only discontinuity left is the base fee at the threshold, which any
 * threshold implies and which is the intended incentive.
 */

/** Used when the setting row is absent or unusable. See `resolveNumericSetting`. */
export const DEFAULT_FREE_DELIVERY_THRESHOLD_KES = 2000;
export const DEFAULT_DELIVERY_FEE_KES = 200;
export const DEFAULT_EXTRA_VENDOR_FEE_KES = 50;

export interface DeliveryPricingSettings {
  /** `delivery_fee` — charged once per basket. */
  baseFee: number;
  /** `clearance_extra_vendor_fee` — per additional vendor beyond the first. */
  extraVendorFee: number;
  /** `free_delivery_threshold` — at or above this subtotal, `baseFee` is waived. */
  freeThreshold: number;
}

/** One vendor's share of a basket. `subtotal` is that vendor's lines only. */
export interface VendorLeg {
  vendorId: string;
  subtotal: number;
}

export interface PricedLeg extends VendorLeg {
  delivery_fee: number;
}

export interface BasketPricing {
  basketSubtotal: number;
  /** Before the waiver. Kept so a receipt can say "free delivery, saved KES 200". */
  grossDeliveryFee: number;
  /** What the customer actually pays. */
  basketDeliveryFee: number;
  waived: boolean;
  /** Sums to `basketDeliveryFee` exactly. */
  legs: PricedLeg[];
}

/**
 * How a numeric setting was resolved.
 *
 * `"fallback"` is surfaced rather than swallowed so the ctx-bound wrapper can
 * log the ops condition. This module deliberately does not log — that is the
 * house rule for `lib/`, and it is also what keeps it testable.
 */
export interface ResolvedSetting {
  value: number;
  resolution: "setting" | "fallback";
}

/**
 * Parse a stored setting, falling back rather than throwing.
 *
 * ── Why fall back instead of throwing ────────────────────────────────────
 *
 * The harm is asymmetric. If a missing threshold meant "no free delivery", the
 * customer who was shown free delivery in the basket is charged at checkout —
 * silently, in their disfavour, at the moment of payment. That is the exact bug
 * being fixed. If it means "2,000", the worst case is the platform gives away a
 * fee it may not have owed: recoverable, visible in revenue, and never a
 * customer-facing lie.
 *
 * Throwing is worst of the three. It blocks checkout for every customer over a
 * data condition no customer caused, and the key is seeded on every deployment
 * that has run `seedDefaults`, so a throw could only ever fire on an already
 * misconfigured deployment — punishing customers for an ops mistake.
 *
 * A stored `0` is treated as unusable, not as "free for everyone". "Always
 * free" is `delivery_fee = 0`; a threshold of 0 is meaningless and would waive
 * the fee on an empty basket.
 */
export function resolveNumericSetting(
  raw: string | null | undefined,
  fallback: number,
): ResolvedSetting {
  if (raw === null || raw === undefined) {
    return { value: fallback, resolution: "fallback" };
  }
  // Number() rather than parseFloat: parseFloat("2,000") returns 2, silently
  // pricing a 2,000 threshold as 2. Number() rejects it outright.
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: fallback, resolution: "fallback" };
  }
  return { value: parsed, resolution: "setting" };
}

/** A fee of zero IS valid, unlike a threshold of zero. */
export function resolveFeeSetting(
  raw: string | null | undefined,
  fallback: number,
): ResolvedSetting {
  if (raw === null || raw === undefined) {
    return { value: fallback, resolution: "fallback" };
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: fallback, resolution: "fallback" };
  }
  return { value: parsed, resolution: "setting" };
}

export function qualifiesForFreeDelivery(
  basketSubtotal: number,
  freeThreshold: number,
): boolean {
  // A zero-value basket never qualifies, however low the threshold. Guarded
  // before the comparison rather than relying on it.
  if (!(basketSubtotal > 0)) return false;
  return basketSubtotal >= freeThreshold;
}

/**
 * Split an integer amount across weighted buckets so the parts sum to the whole.
 *
 * Largest-remainder (Hare quota). Everything is integer arithmetic: money is
 * never divided as a float, so the sum invariant holds by construction rather
 * than by rounding luck.
 *
 * Ties are broken by ascending `key`, never by array order. Callers build legs
 * by iterating a Map or an object, so array order is an iteration artefact —
 * tie-breaking on it would price the same basket differently between two runs.
 */
export function apportion(
  total: number,
  weights: number[],
  keys: string[],
): number[] {
  if (weights.length !== keys.length) {
    throw new Error("apportion: weights and keys must be the same length");
  }
  const n = weights.length;
  if (n === 0) return [];
  if (!Number.isInteger(total)) {
    throw new Error(`apportion: total must be an integer, got ${total}`);
  }
  if (total === 0) return new Array(n).fill(0);

  // A zero-value basket across several vendors still has to apportion
  // deterministically rather than divide by zero.
  const safeWeights = weights.some((w) => w > 0) ? weights : weights.map(() => 1);
  const totalWeight = safeWeights.reduce((sum, w) => sum + w, 0);

  const floors: number[] = [];
  const remainders: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const exact = total * safeWeights[i]!;
    const floor = Math.floor(exact / totalWeight);
    floors.push(floor);
    // Integer remainder, so no float comparison decides the ordering.
    remainders.push(exact - floor * totalWeight);
  }

  let deficit = total - floors.reduce((sum, f) => sum + f, 0);

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    if (remainders[b]! !== remainders[a]!) return remainders[b]! - remainders[a]!;
    return keys[a]!.localeCompare(keys[b]!);
  });

  for (const index of order) {
    if (deficit <= 0) break;
    floors[index] = floors[index]! + 1;
    deficit -= 1;
  }

  return floors;
}

/** Whole shillings. KES has no practical retail subunit and every surface rounds. */
const MINOR_UNITS_PER_KES = 1;

/**
 * Price a basket's delivery and apportion it across its vendor legs.
 *
 * Throws only on a caller bug — a non-finite subtotal, or a duplicated vendor.
 * The distinction from the settings above is deliberate: a malformed *setting*
 * is an ops condition with a safe answer, so it falls back; a non-finite
 * subtotal is a bug in code we control with no safe number to invent, so it
 * should be loud in development and caught by a test rather than silently
 * pricing something.
 */
export function priceBasketDelivery(
  legs: VendorLeg[],
  settings: DeliveryPricingSettings,
): BasketPricing {
  const seen = new Set<string>();
  for (const leg of legs) {
    if (!Number.isFinite(leg.subtotal)) {
      throw new Error(
        `priceBasketDelivery: leg ${leg.vendorId} has a non-finite subtotal`,
      );
    }
    if (seen.has(leg.vendorId)) {
      throw new Error(
        `priceBasketDelivery: vendor ${leg.vendorId} appears twice; legs must be grouped by vendor`,
      );
    }
    seen.add(leg.vendorId);
  }

  const basketSubtotal = Math.max(
    0,
    legs.reduce((sum, leg) => sum + leg.subtotal, 0),
  );

  const vendorCount = legs.length;
  if (vendorCount === 0 || basketSubtotal <= 0) {
    return {
      basketSubtotal,
      grossDeliveryFee: 0,
      basketDeliveryFee: 0,
      waived: false,
      legs: legs.map((leg) => ({ ...leg, delivery_fee: 0 })),
    };
  }

  const grossDeliveryFee =
    settings.baseFee + settings.extraVendorFee * (vendorCount - 1);

  const waived = qualifiesForFreeDelivery(basketSubtotal, settings.freeThreshold);
  // The waiver is capped at ONE base fee: above the threshold the customer
  // stops paying `base` but still covers extra-shop pickups.
  const basketDeliveryFee = Math.max(
    0,
    grossDeliveryFee - (waived ? settings.baseFee : 0),
  );

  const allocated = apportion(
    Math.round(basketDeliveryFee * MINOR_UNITS_PER_KES),
    legs.map((leg) => Math.max(0, Math.round(leg.subtotal))),
    legs.map((leg) => leg.vendorId),
  );

  return {
    basketSubtotal,
    grossDeliveryFee,
    basketDeliveryFee,
    waived,
    legs: legs.map((leg, i) => ({
      ...leg,
      delivery_fee: allocated[i]! / MINOR_UNITS_PER_KES,
    })),
  };
}

/**
 * Clearance delivery, kept separate on purpose.
 *
 * Same `base + extra * (N-1)` shape, but the free-delivery threshold does NOT
 * apply: clearance items are already discounted and stacking free delivery
 * erodes the margin twice. Sharing the module while excluding the waiver is
 * what makes that an explicit decision rather than an accident nobody notices.
 */
export function priceClearanceDelivery(
  vendorCount: number,
  settings: { baseFee: number; extraVendorFee: number },
): number {
  if (vendorCount <= 0) return 0;
  return settings.baseFee + settings.extraVendorFee * (vendorCount - 1);
}
