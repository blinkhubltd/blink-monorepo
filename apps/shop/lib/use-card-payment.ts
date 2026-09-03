import { useCallback, useEffect, useReducer, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePaystack } from "react-native-paystack-webview";
import { useAction } from "convex/react";
import { api } from "@repo/backend";

import {
  cardReducer,
  describeCardState,
  canPay as canPayFrom,
  isInFlight,
  nextPollDelay,
  type CardState,
} from "./card-payment-state";

/**
 * The card payment lifecycle, wired to the device.
 *
 * All the rules live in `card-payment-state.ts` and are unit tested. This file
 * holds only the three things that genuinely need a device: the payment sheet,
 * the `AppState` listener, and the timers. It makes no decisions.
 *
 * ── What was ported deliberately ─────────────────────────────────────────
 *
 * From the old `PaystackPayment.tsx`, three things earned their place:
 *
 *   - the in-flight latch, which was the only guard there that actually worked;
 *   - `appStateRef`, so verification fires on a genuine background→active and
 *     not on `inactive → active` (which iOS emits for a notification banner);
 *   - the pause before verifying after the app returns. Paystack's own state
 *     settles a beat later, so asking immediately reliably answers "pending".
 *
 * ── What was not ────────────────────────────────────────────────────────
 *
 * `hooks/usePayment.ts` in its entirety. It called `payments.createPayment`
 * with a client-supplied amount, which would write a second payments row
 * carrying no quote — and finalisation falls back to client numbers when the
 * quote is absent. `beginCheckout` already created the row and priced it.
 *
 * And these outright bugs:
 *
 *   - `usePaystack()` inside a `try/catch` IIFE. If it throws on one render and
 *     not the next, the hook count changes and React unmounts the tree.
 *   - the 1s verification timer, never stored, so it fired after unmount.
 *   - polling that compared against a `paymentStatus` captured in the closure
 *     when the interval was created, so the in-tick success check could never
 *     become true.
 *   - `launchAttemptedRef`, reset to `false` four lines above its own check, so
 *     it could never be true when read.
 *   - five separate paths delivering success to the parent with nothing marking
 *     that success had already been delivered.
 *
 * ── The vendor split ───────────────────────────────────────────────────
 *
 * Before the sheet opens, `prepareMyPaymentSplit` turns the checkout's stored
 * quote into a Paystack split and returns its `split_code`, which is what
 * actually routes each vendor's share to their own subaccount rather than all
 * of it landing in the platform's account. This is not optional or
 * best-effort: without it, a card payment collects the vendor's money and
 * gives the vendor none of it. A failure here fails the whole attempt before
 * the sheet ever opens — nothing has been charged yet, so refusing is safe.
 */

/** Long enough for Paystack to settle, short enough not to feel stalled. */
const RETURN_SETTLE_MS = 1_000;

export type CardPaymentParams = {
  /** From `beginCheckout`. The quote and the amount are already stored on it. */
  reference: string;
  /**
   * MAJOR units — shillings, not cents.
   *
   * The SDK multiplies by 100 itself (`utils.js`: `amount: ${config.amount * 100}`),
   * so converting here would charge a hundred times the basket. The old
   * component had this right and a comment above it saying the opposite.
   */
  amount: number;
  email: string;
};

export function useCardPayment(opts: {
  /** Called once, ever, when the server confirms and the orders exist. */
  onSettled: (orderIds: string[]) => void;
}) {
  const [state, dispatch] = useReducer(cardReducer, { kind: "idle" } as CardState);

  const { popup } = usePaystack();
  const confirm = useAction(api.data.checkout.confirmMyCardPayment);
  const prepareSplit = useAction(api.data.payment_split.prepareMyPaymentSplit);

  // The reference currently in flight. A ref because the AppState listener and
  // the verify timer both need the latest value without re-subscribing.
  const referenceRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const settledRef = useRef(false);

  // `onSettled` through a ref so the verify effect does not re-run — and
  // re-fire — every time the screen re-renders with a new closure.
  const onSettledRef = useRef(opts.onSettled);
  useEffect(() => {
    onSettledRef.current = opts.onSettled;
  }, [opts.onSettled]);

  // Deliver success exactly once. The reducer already makes `settled` terminal;
  // this is the second half of the latch, on the side-effecting edge.
  useEffect(() => {
    if (state.kind !== "settled" || settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current(state.orderIds);
  }, [state]);

  /*
    Ask the server, on a backoff, while the state says to.

    The delay and the attempt budget both come from the pure module, so the
    thing this effect contributes is only the timer — and its cleanup, which is
    what the old component was missing.
  */
  useEffect(() => {
    if (state.kind !== "verifying") return;
    const reference = referenceRef.current;
    if (!reference) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await confirm({ reference });
          if (!cancelled) dispatch({ type: "verified", result });
        } catch {
          // A failed request is not a verdict — see `verifyThrew`.
          if (!cancelled) dispatch({ type: "verifyThrew" });
        }
      })();
    }, nextPollDelay(state.attempt));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, confirm]);

  /*
    The app coming back to the foreground.

    This is why a customer can approve an M-Pesa push in another app, or pay in
    a browser, and still have their order appear. The listener is registered
    once; everything it needs is in a ref.
  */
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const subscription = AppState.addEventListener("change", (next) => {
      const cameBack = appStateRef.current === "background" && next === "active";
      appStateRef.current = next;
      if (!cameBack || !referenceRef.current) return;

      // Stored and cleared, unlike the original. An uncleared timer here fires
      // after unmount and re-enters verification on a screen that is gone.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        dispatch({ type: "returned" });
      }, RETURN_SETTLE_MS);
    });

    return () => {
      subscription.remove();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  const start = useCallback(
    (params: CardPaymentParams) => {
      // The double-tap guard. The reducer ignores `open` while in flight too;
      // this returns early so the sheet is not even asked.
      if (isInFlight(state) || settledRef.current) return;

      const amount = Math.round(params.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        dispatch({
          type: "sheetErrored",
          message: "That total could not be charged. Please try again.",
        });
        return;
      }

      referenceRef.current = params.reference;
      dispatch({ type: "open" });

      void (async () => {
        // The split has to be ready before the sheet opens — it is what
        // actually routes the vendor's share to them, not a nicety layered on
        // afterwards. Nothing has been charged yet, so failing here is safe.
        let splitCode: string | undefined;
        try {
          const prepared = await prepareSplit({ reference: params.reference });
          splitCode = prepared.split_code;
        } catch (error) {
          dispatch({
            type: "sheetErrored",
            message:
              "This order can't be paid for online right now. Please try again shortly, or choose pay on delivery.",
          });
          return;
        }

        try {
          popup.newTransaction({
            email: params.email,
            // Major units. See the note on `CardPaymentParams.amount`.
            amount,
            // The server's reference, so the quote, the charge and the orders
            // all key on one string.
            reference: params.reference,
            split_code: splitCode,
            onSuccess: () => dispatch({ type: "sheetSucceeded" }),
            onCancel: () => dispatch({ type: "sheetCancelled" }),
            onError: (error) =>
              dispatch({ type: "sheetErrored", message: error?.message }),
          });
        } catch (error) {
          dispatch({
            type: "sheetErrored",
            message:
              error instanceof Error
                ? error.message
                : "The payment window could not be opened.",
          });
        }
      })();
    },
    [popup, state, prepareSplit],
  );

  const reset = useCallback(() => {
    referenceRef.current = null;
    settledRef.current = false;
    dispatch({ type: "reset" });
  }, []);

  return {
    state,
    message: describeCardState(state),
    start,
    reset,
    canPay: canPayFrom(state),
    busy: isInFlight(state),
  };
}
