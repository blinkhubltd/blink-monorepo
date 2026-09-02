/**
 * The card payment lifecycle, as data.
 *
 * ── Why this is a separate, pure module ──────────────────────────────────
 *
 * The component this replaces was 443 lines holding eight pieces of state, five
 * of which could each deliver "success" to the parent, with nothing recording
 * that success had already been delivered. `checkout.tsx` then finalised
 * unguarded on every one of them, so duplicate orders were reachable — and none
 * of it was testable without a device and a real charge.
 *
 * So the lifecycle lives here as a reducer over a discriminated union, and the
 * hook does nothing but feed it events. What that buys, concretely: the poll
 * budget, the "charged but unconfirmed" transition and the once-only success
 * latch are all decided by code that runs in `vitest` on a laptop. The parts
 * that genuinely need a device — the webview, `AppState` — hold no rules.
 *
 * Same pattern as `checkout-rules.ts` and `order-status.ts`: policy pure and
 * tested, screens holding none of it.
 */

/**
 * What the server said when asked about a reference.
 *
 * Mirrors `checkout.confirmMyCardPayment`'s return. `unverifiable` is its own
 * outcome rather than a flavour of failure: it means `PAYSTACK_SECRET_KEY` is
 * unset on the deployment, so the charge may well have succeeded and we simply
 * cannot ask. The old client folded this into "pending" and polled for 45
 * seconds before going quiet, which reads to the customer as a slow payment
 * rather than a broken build.
 */
export type Verification =
  | { state: "successful"; orderIds: string[] }
  | { state: "pending" }
  | { state: "failed"; reason: string }
  | { state: "unverifiable" };

export type CardState =
  /** Nothing started. The pay button is live. */
  | { kind: "idle" }
  /** The sheet is open. The customer is entering a card or a PIN. */
  | { kind: "opening" }
  /** The sheet closed, or the app came back; we are asking the server. */
  | { kind: "verifying"; attempt: number }
  /** Confirmed and the orders exist. Terminal. */
  | { kind: "settled"; orderIds: string[] }
  /**
   * Charged, but confirmation has not arrived within our budget. NOT a failure,
   * and the wording the screen shows must not suggest one — the webhook settles
   * it server-side whether or not this app is still running.
   */
  | { kind: "pending" }
  /** Paystack said no, or the sheet errored. Retryable. */
  | { kind: "failed"; message: string }
  /** The customer backed out. Retryable, and nothing was charged. */
  | { kind: "cancelled" };

export type CardEvent =
  | { type: "open" }
  /** The sheet reported success. Not trusted — it only triggers verification. */
  | { type: "sheetSucceeded" }
  | { type: "sheetCancelled" }
  | { type: "sheetErrored"; message?: string }
  /** The app came back to the foreground with a payment in flight. */
  | { type: "returned" }
  | { type: "verified"; result: Verification }
  /** A verification attempt itself failed — network, not a verdict. */
  | { type: "verifyThrew" }
  | { type: "reset" };

/**
 * How many times we ask before telling the customer it is still confirming.
 *
 * Five, over roughly 30 seconds. Deliberately short: the answer arriving here is
 * a convenience, not the mechanism. The webhook is the mechanism, so giving up
 * asking costs the customer a screen that says "confirming", not an order.
 *
 * The old client's budget was 15 polls at 3s with the charge only detectable
 * through a closure it had captured before the data existed.
 */
export const MAX_VERIFY_ATTEMPTS = 5;

/**
 * Backoff, in milliseconds, before attempt `n` (1-based).
 *
 * Paystack's own state settles a beat after the sheet closes, so the first wait
 * is the longest thing standing between "paid" and "confirmed" and is kept
 * short. Later waits grow, because if it is not settled by attempt three it is
 * a slow M-Pesa STK push and hammering it helps nobody.
 *
 * Bounded by construction: an unknown attempt number gets the ceiling rather
 * than `undefined` arithmetic, which is how a backoff table becomes a `NaN`
 * timer that never fires.
 */
export function nextPollDelay(attempt: number): number {
  const schedule = [1_000, 2_000, 4_000, 8_000, 15_000];
  if (!Number.isFinite(attempt) || attempt < 1) return schedule[0]!;
  const index = Math.min(Math.floor(attempt), schedule.length) - 1;
  return schedule[index]!;
}

/** Whether a state still wants the app to keep asking. */
export function isInFlight(state: CardState): boolean {
  return state.kind === "opening" || state.kind === "verifying";
}

/** Whether the customer may press pay. */
export function canPay(state: CardState): boolean {
  return (
    state.kind === "idle" ||
    state.kind === "cancelled" ||
    state.kind === "failed"
  );
}

/**
 * Map a server verdict onto the next state.
 *
 * `attempt` is what has already been spent. Exceeding the budget on a still
 * pending charge lands on `pending`, never on `failed`: we have no evidence the
 * payment failed, and telling a customer their payment failed when it did not is
 * the worst thing this screen can do.
 */
export function resolveVerification(
  result: Verification,
  attempt: number,
): CardState {
  switch (result.state) {
    case "successful":
      return { kind: "settled", orderIds: result.orderIds };
    case "failed":
      return {
        kind: "failed",
        message:
          result.reason === "abandoned"
            ? "The payment was not completed. Nothing has been charged."
            : "The payment did not go through. Nothing has been charged.",
      };
    case "unverifiable":
      // Says what is wrong without inventing a payment outcome. Support can act
      // on this; "something went wrong" cannot be acted on by anyone.
      return {
        kind: "failed",
        message:
          "We could not confirm the payment because this build is not configured for payments. Nothing has been charged — contact support.",
      };
    case "pending":
      return attempt >= MAX_VERIFY_ATTEMPTS
        ? { kind: "pending" }
        : { kind: "verifying", attempt: attempt + 1 };
  }
}

/**
 * The reducer.
 *
 * Two invariants it exists to hold:
 *
 *   1. **`settled` is terminal.** Once the orders exist, no later event moves
 *      off it. This is the once-only success latch the old component lacked;
 *      without it a returning app, a late poll and the sheet callback each
 *      delivered success and each finalised.
 *   2. **A sheet callback never decides the outcome.** `sheetSucceeded` moves to
 *      `verifying`, not to `settled`. The sheet runs on the customer's device.
 */
export function cardReducer(state: CardState, event: CardEvent): CardState {
  if (event.type === "reset") return { kind: "idle" };

  // Invariant 1. Checked before anything else, so ordering of the cases below
  // cannot accidentally break it.
  if (state.kind === "settled") return state;

  switch (event.type) {
    case "open":
      // Ignored while a sheet is already open — the double-tap guard.
      return isInFlight(state) ? state : { kind: "opening" };

    case "sheetSucceeded":
      // Invariant 2.
      return { kind: "verifying", attempt: 1 };

    case "sheetCancelled":
      // Only from an open sheet. A cancel arriving while we are verifying is
      // the webview tearing down after a success, and must not undo it.
      return state.kind === "opening" ? { kind: "cancelled" } : state;

    case "sheetErrored":
      if (state.kind !== "opening") return state;
      return {
        kind: "failed",
        message:
          event.message?.trim() ||
          "The payment window could not be completed. Nothing has been charged.",
      };

    case "returned":
      // The app came back. Verify if a payment is outstanding; otherwise this
      // is an ordinary foreground and must not start anything.
      if (state.kind === "opening") return { kind: "verifying", attempt: 1 };
      if (state.kind === "pending") return { kind: "verifying", attempt: 1 };
      return state;

    case "verified":
      if (state.kind !== "verifying") return state;
      return resolveVerification(event.result, state.attempt);

    case "verifyThrew":
      // A network failure is not a verdict. Spend an attempt and try again;
      // running out lands on `pending`, which is true — the charge may well
      // have gone through and the webhook will settle it.
      if (state.kind !== "verifying") return state;
      return state.attempt >= MAX_VERIFY_ATTEMPTS
        ? { kind: "pending" }
        : { kind: "verifying", attempt: state.attempt + 1 };
  }
}

/** What the customer reads while this is happening. */
export function describeCardState(state: CardState): string | null {
  switch (state.kind) {
    case "opening":
      return "Complete the payment in the window that opened.";
    case "verifying":
      return "Confirming your payment…";
    case "pending":
      // Deliberately not an error. The order is coming.
      return "Your payment is being confirmed. Your order will appear in Orders shortly — you can close this screen.";
    case "failed":
      return state.message;
    case "cancelled":
      return "Payment cancelled. Your basket is unchanged.";
    case "settled":
    case "idle":
      return null;
  }
}
