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
 * of the request failing. The server remains the authority throughout; this is
 * only ever an explanation offered earlier.
 *
 * The payout-DAY rule is not checked here — it needs the platform setting, so
 * it lives in `payoutDayProblem` below and the screen asks both.
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
 * Which weekdays payouts may be requested on, from the platform setting the
 * SERVER enforces (`agent_payout_days`).
 *
 * ── Why the rule is mirrored on the client after all ─────────────────────
 *
 * This screen used to say only that the server checks the day, on the
 * reasoning that a client copy of the rule would be the one that goes
 * stale. That holds for a *copy* — a hardcoded list of days here — but not
 * for reading the same row the server reads. Nothing is bypassable either
 * way: `requestMyPayout` re-checks. What it buys is that Wednesday says so
 * on Wednesday, instead of the form taking an amount and the request
 * bouncing back.
 */
export function parsePayoutDays(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((day) => day.trim().toLowerCase())
    .filter((day) => day.length > 0);
}

/**
 * `null` when today is allowed — or when nothing is configured.
 *
 * An empty or whitespace-only setting means "no restriction", matching the
 * server exactly. Reading it as "no day is allowed" would silently block
 * every payout on the platform.
 */
export function payoutDayProblem(
  value: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const allowed = parsePayoutDays(value);
  if (allowed.length === 0) return null;

  const today = now
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  if (allowed.includes(today)) return null;

  // Quotes the setting's own text rather than a re-formatted list: it is
  // what the admin typed and what the server quotes back on refusal, so the
  // two messages match word for word.
  return `Payouts can only be requested on ${value}.`;
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

/**
 * The Play Store link an agent shares to earn install credit.
 *
 * `referrer` is the standard Play Store install-referrer query param — Google
 * passes whatever follows it straight through to
 * `PlayInstallReferrerClient.getInstallReferrer()` on the freshly-installed
 * device, unmodified. `lib/install-attribution.ts`'s
 * `parseAgentCodeFromReferrer` is this function's exact inverse: what one
 * writes into the link, the other reads back out of what Google reports.
 *
 * Android only, deliberately — there is no equivalent on iOS (no public
 * install-referrer API), so a link built this way is only useful pointed at
 * the Play Store listing, never the App Store one.
 */
export function playStoreInstallLink(agentCode: string): string {
  const referrer = encodeURIComponent(`blink_ref=${agentCode.trim()}`);
  return `https://play.google.com/store/apps/details?id=com.blink.app&referrer=${referrer}`;
}

/**
 * The date filters on the earnings list, ported from the old dashboard.
 *
 * Boundaries are local-midnight based rather than rolling 24/7/30-hour
 * windows: an agent asking "what did I earn today" means since midnight,
 * and a rolling window would quietly include yesterday evening.
 */
export const EARNING_RANGES = ["all", "today", "week", "month"] as const;
export type EarningRange = (typeof EARNING_RANGES)[number];

export function describeEarningRange(range: EarningRange): string {
  if (range === "today") return "Today";
  if (range === "week") return "This week";
  if (range === "month") return "This month";
  return "All";
}

/** The inclusive lower bound for a range, or null for "all". */
export function earningRangeStart(
  range: EarningRange,
  now: Date = new Date(),
): number | null {
  if (range === "all") return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "today") return start.getTime();

  if (range === "week") {
    // Monday, matching how a payout week is talked about here. JS makes
    // Sunday 0, so Sunday counts as the END of the week just gone rather
    // than the start of the one beginning tomorrow.
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
    return start.getTime();
  }

  start.setDate(1);
  return start.getTime();
}

export function filterEarningsByRange<T extends { created_at: number }>(
  earnings: readonly T[],
  range: EarningRange,
  now: Date = new Date(),
): T[] {
  const start = earningRangeStart(range, now);
  if (start === null) return [...earnings];
  return earnings.filter((earning) => earning.created_at >= start);
}
