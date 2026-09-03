/**
 * Clearance rules that belong on the client, pure and tested.
 *
 * The single thing a clearance buyer must understand before paying is how long
 * the item is good for. Two different dates are involved and they mean different
 * things, which is exactly the sort of distinction a UI loses:
 *
 *   `expiry_date`       — when the FOOD goes off. The buyer's problem.
 *   `display_end_date`  — when the OFFER stops. The shop's scheduling.
 *
 * Showing the second as though it were the first would tell someone their
 * yoghurt is fine for a fortnight when it turns tomorrow. `describeExpiry`
 * prefers the real expiry and says which one it is showing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** At or under this many days left, the line is styled as urgent. */
export const URGENT_DAYS = 3;

export interface ExpiryDescription {
  label: string;
  urgent: boolean;
  /** Which date the label is about, so a caller can phrase around it. */
  basis: "expiry" | "offer" | "none";
}

/**
 * Days remaining, counted in whole days from a reference point.
 *
 * Floored, not rounded up. Rounding up reports an item expiring in ten minutes
 * as having a day left — an error in the direction that gets someone ill, and
 * the exact case this screen exists to warn about. Flooring understates the
 * shelf life at worst.
 *
 * `now` is a parameter rather than a call to `Date.now()` so this is testable
 * without freezing the clock — the house rule the old `lib/schedule.ts` broke by
 * mutating a `Date` in place with a hardcoded +3 offset.
 */
export function daysUntil(timestamp: number, now: number): number {
  return Math.floor((timestamp - now) / DAY_MS);
}

export function describeExpiry(
  expiryDate: number | undefined,
  displayEndDate: number,
  now: number = Date.now(),
): ExpiryDescription {
  // The food date wins when it exists. It is the one that affects the buyer.
  if (expiryDate !== undefined && Number.isFinite(expiryDate)) {
    const days = daysUntil(expiryDate, now);
    if (days < 0) {
      return { label: "Past its date", urgent: true, basis: "expiry" };
    }
    if (days === 0) {
      return { label: "Use today", urgent: true, basis: "expiry" };
    }
    if (days === 1) {
      return { label: "Use by tomorrow", urgent: true, basis: "expiry" };
    }
    return {
      label: `Use within ${days} days`,
      urgent: days <= URGENT_DAYS,
      basis: "expiry",
    };
  }

  // No food date: fall back to how long the offer runs, and say so, rather than
  // presenting a scheduling date as a shelf life.
  const days = daysUntil(displayEndDate, now);
  if (days < 0) return { label: "Offer ended", urgent: true, basis: "offer" };
  if (days === 0) {
    return { label: "Offer ends today", urgent: true, basis: "offer" };
  }
  if (days === 1) {
    return { label: "Offer ends tomorrow", urgent: true, basis: "offer" };
  }
  return {
    label: `Offer ends in ${days} days`,
    urgent: days <= URGENT_DAYS,
    basis: "offer",
  };
}

/**
 * The saving, as a figure and a percentage.
 *
 * Computed from the two prices rather than read from `discount_percentage`,
 * which is stored independently and can disagree with them — and a shown
 * percentage that does not match the shown prices is the kind of thing customers
 * screenshot. Returns null when there is no saving to claim.
 */
export function describeSaving(
  originalPrice: number,
  clearancePrice: number,
): { amount: number; percent: number } | null {
  if (!Number.isFinite(originalPrice) || !Number.isFinite(clearancePrice)) {
    return null;
  }
  if (originalPrice <= clearancePrice || clearancePrice < 0) return null;
  const amount = originalPrice - clearancePrice;
  return {
    amount,
    percent: Math.round((amount / originalPrice) * 100),
  };
}

/**
 * Whether a listing can be bought right now.
 *
 * The same three conditions the server enforces on write, restated here so the
 * screen can explain rather than only discovering it on failure. The server
 * remains the authority — this is presentation, not permission.
 */
export function clearanceUnavailableReason(
  listing: { status: string; quantity: number; display_end_date: number },
  now: number = Date.now(),
): string | null {
  if (listing.display_end_date <= now) return "This deal has ended";
  if (listing.status !== "Active") return "No longer available";
  if (listing.quantity <= 0) return "Sold out";
  return null;
}
