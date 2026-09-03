/**
 * Vendor payout split, computed from a stored quote.
 *
 * ── Why this exists as a pure module ──────────────────────────────────────
 *
 * The Paystack split preparation that used to live inline in `payment_split.ts`
 * re-derived everything from live product prices: it re-fetched every product
 * in the cart, recomputed vendor weights, and inferred the delivery fee as
 * `payment.amount - itemsTotal`. That is the same shape of bug the checkout
 * rewrite closed everywhere else — a figure recomputed after the fact can
 * disagree with the one actually charged.
 *
 * The stored quote already has the exact per-vendor breakdown this needs:
 * `quote.legs[n].subtotal` is that vendor's item-level charge, already priced
 * server-side and already what the customer paid. This module turns that,
 * plus each vendor's commission terms, into a split — nothing else.
 *
 * ── Delivery fee stays with the platform ─────────────────────────────────
 *
 * A rider delivers the basket, not the vendor's own staff, so the delivery
 * fee is not the vendor's to share. Every leg's `deliveryFee` is summed and
 * kept out of every vendor's share entirely — it settles to the platform
 * alongside commission, never split with a vendor subaccount.
 *
 * ── Units ──────────────────────────────────────────────────────────────
 *
 * Quote figures are whole KES (`checkout_quote.ts` rounds every figure it
 * produces). This module's own arithmetic works in those major-unit whole
 * shillings; converting to Paystack's minor units (cents) is the caller's job,
 * via `lib/paystack.ts`'s `toMinorUnits` — kept out of here so this stays
 * currency-conversion-free and testable on the numbers a quote actually
 * contains.
 */

import type { Id } from "../_generated/dataModel";

export type SplitLeg = {
  vendorId: Id<"vendors">;
  /** Items only. Never includes delivery. */
  subtotal: number;
};

export type VendorCommissionTerms = {
  commission_type: "percentage" | "fixed";
  commission: number;
};

export type VendorShare = {
  vendorId: Id<"vendors">;
  /** The vendor's item-level charge, before commission. */
  grossMajor: number;
  commissionMajor: number;
  /** What actually settles to the vendor's subaccount. */
  netMajor: number;
};

export type VendorSplit = {
  vendors: VendorShare[];
  /** Sum of every vendor's commission. Settles to the platform. */
  commissionTotalMajor: number;
  /** Sum of every leg's delivery fee. Settles to the platform, in full. */
  deliveryFeeTotalMajor: number;
  /** commissionTotalMajor + deliveryFeeTotalMajor. */
  platformMajor: number;
  /** Sum of every leg's subtotal. Equals sum(vendors[].grossMajor). */
  itemsTotalMajor: number;
};

/**
 * One vendor's commission, in whole KES, from their stored terms.
 *
 * Rounds rather than truncates or ceils: a commission rate is a business term
 * agreed as a percentage or a flat fee, and standard rounding is the one
 * choice that does not systematically favour either side across many orders.
 *
 * Clamped to the gross: a vendor whose commission is misconfigured above their
 * own subtotal (a fixed fee larger than a small basket, for instance) still
 * settles a non-negative net rather than owing the platform money out of a
 * single order.
 */
export function vendorCommission(
  grossMajor: number,
  terms: VendorCommissionTerms,
): number {
  const raw =
    terms.commission_type === "percentage"
      ? (grossMajor * terms.commission) / 100
      : terms.commission;
  return Math.min(Math.max(0, Math.round(raw)), Math.round(grossMajor));
}

/**
 * Build the split from a quote's legs and each vendor's commission terms.
 *
 * `commissionOf` is a lookup rather than a field on `SplitLeg` so the caller
 * reads vendor rows once, however that is most convenient, rather than this
 * module dictating how.
 *
 * The exact-sum invariant this holds: for every leg,
 * `netMajor + commissionMajor === subtotal`, always, because `netMajor` is
 * derived by subtracting the already-rounded commission from the already-whole
 * subtotal — never two independently-rounded figures that might not agree.
 * Summed across legs, `sum(vendors[].netMajor) + platformMajor` therefore
 * equals `itemsTotalMajor + deliveryFeeTotalMajor`, the full quote total,
 * exactly.
 */
export function computeVendorSplit(
  legs: readonly SplitLeg[],
  deliveryFees: readonly number[],
  commissionOf: (vendorId: Id<"vendors">) => VendorCommissionTerms,
): VendorSplit {
  if (legs.length === 0) {
    throw new Error("computeVendorSplit: a basket with no legs cannot split");
  }
  if (deliveryFees.length !== legs.length) {
    throw new Error(
      "computeVendorSplit: deliveryFees must have one entry per leg",
    );
  }

  const vendors: VendorShare[] = legs.map((leg) => {
    const grossMajor = Math.max(0, Math.round(leg.subtotal));
    const commissionMajor = vendorCommission(grossMajor, commissionOf(leg.vendorId));
    return {
      vendorId: leg.vendorId,
      grossMajor,
      commissionMajor,
      netMajor: grossMajor - commissionMajor,
    };
  });

  const commissionTotalMajor = vendors.reduce(
    (sum, v) => sum + v.commissionMajor,
    0,
  );
  const deliveryFeeTotalMajor = deliveryFees.reduce(
    (sum, fee) => sum + Math.max(0, Math.round(fee)),
    0,
  );
  const itemsTotalMajor = vendors.reduce((sum, v) => sum + v.grossMajor, 0);

  return {
    vendors,
    commissionTotalMajor,
    deliveryFeeTotalMajor,
    platformMajor: commissionTotalMajor + deliveryFeeTotalMajor,
    itemsTotalMajor,
  };
}
