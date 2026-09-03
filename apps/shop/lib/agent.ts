/**
 * Agent payout presentation, as a typed lookup.
 *
 * Same reason as `order-status.ts` and `notification-kind.ts`: the app this
 * replaces built class names by interpolation, so an unknown status rendered as
 * an invisibly unstyled badge and the Tailwind config carried a safelist regex to
 * keep the known ones alive. Here a missing case is a type error and an
 * unrecognised one at runtime falls back to its own name.
 */

/** The `agentPaymentRequestStatus` union in the backend validators. */
export const PAYOUT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export interface PayoutPresentation {
  label: string;
  variant: "default" | "success" | "warning" | "destructive" | "secondary";
}

const PAYOUT = {
  pending: { label: "Awaiting approval", variant: "warning" },
  approved: { label: "Approved", variant: "info" },
  rejected: { label: "Rejected", variant: "destructive" },
  paid: { label: "Paid", variant: "success" },
} as const satisfies Record<
  PayoutStatus,
  { label: string; variant: PayoutPresentation["variant"] | "info" }
>;

export function describePayoutStatus(status: string): {
  label: string;
  variant: "default" | "success" | "warning" | "destructive" | "secondary" | "info";
} {
  // `hasOwnProperty`, not a bare index: indexing an object literal with
  // "constructor" reaches Object.prototype and returns a truthy function, so a
  // `??` fallback never fires and the badge renders undefined.
  if (Object.prototype.hasOwnProperty.call(PAYOUT, status)) {
    return PAYOUT[status as PayoutStatus];
  }
  return { label: status, variant: "secondary" };
}

/**
 * What an agent can actually withdraw.
 *
 * Balance minus money already claimed by an open request. The server computes
 * the authoritative figure; this exists so a screen can show the arithmetic
 * rather than presenting a smaller number with no explanation — which reads as a
 * missing payment.
 */
export function availableBalance(
  balance: number,
  requestedAmount: number,
): number {
  if (!Number.isFinite(balance)) return 0;
  const claimed = Number.isFinite(requestedAmount) ? requestedAmount : 0;
  return Math.max(0, balance - claimed);
}

/**
 * Whether an amount can be requested.
 *
 * Mirrors the server's rules so the button can be disabled with a reason instead
 * of the request failing. The server remains the authority — in particular for
 * the payout-day rule, which depends on a setting this screen does not read.
 */
export function payoutRequestProblem(input: {
  amount: number;
  available: number;
  payoutsEnabled: boolean;
  hasPendingRequest: boolean;
}): string | null {
  if (!input.payoutsEnabled) {
    return "Payouts are not enabled on your account yet.";
  }
  if (input.hasPendingRequest) {
    return "You already have a request awaiting approval.";
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "Enter an amount.";
  }
  if (input.amount > input.available) {
    return "That is more than your available balance.";
  }
  return null;
}

/**
 * The QR/share deep link for an agent's referral code.
 *
 * A custom `blink://` scheme, not a universal `https://` link. `app.config.ts`'s
 * `associatedDomains` point at `blink.app`, which redirects to an unrelated
 * company (see `lib/legal.ts`'s comment on the same domain) — there is no real
 * website to fall back to yet, so a universal link would 404 or land on
 * somebody else's site for anyone who scans it without the app already
 * installed. The custom scheme at least resolves correctly for the one
 * audience it can serve today: someone who already has the app.
 *
 * Revisit once a real domain exists — a universal link degrades gracefully
 * (falls through to a web page) where a custom scheme does not (nothing
 * happens if the app is not installed).
 */
export function referralDeepLink(code: string): string {
  return `blink://referral?code=${encodeURIComponent(code)}`;
}
