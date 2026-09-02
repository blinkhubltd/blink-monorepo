import { describe, expect, it } from "vitest";

import {
  MAX_VERIFY_ATTEMPTS,
  canPay,
  cardReducer,
  describeCardState,
  isInFlight,
  nextPollDelay,
  resolveVerification,
  type CardEvent,
  type CardState,
} from "../lib/card-payment-state";

/**
 * The card lifecycle, tested without a device.
 *
 * Every case here is one the old 443-line component got wrong, and every one of
 * them was invisible to a type check.
 */

function run(events: CardEvent[], from: CardState = { kind: "idle" }): CardState {
  return events.reduce(cardReducer, from);
}

describe("the sheet does not get to decide the outcome", () => {
  it("a reported success moves to verifying, never to settled", () => {
    // The whole trust boundary. The old component's onSuccess called a public
    // updatePaymentStatus({status: "Successful"}) directly.
    const state = run([{ type: "open" }, { type: "sheetSucceeded" }]);
    expect(state).toEqual({ kind: "verifying", attempt: 1 });
  });

  it("only the server's verdict settles it", () => {
    const state = run([
      { type: "open" },
      { type: "sheetSucceeded" },
      { type: "verified", result: { state: "successful", orderIds: ["o1"] } },
    ]);
    expect(state).toEqual({ kind: "settled", orderIds: ["o1"] });
  });
});

describe("settled is terminal — the once-only success latch", () => {
  const settled = run([
    { type: "open" },
    { type: "sheetSucceeded" },
    { type: "verified", result: { state: "successful", orderIds: ["o1"] } },
  ]);

  it("no later event moves off it", () => {
    // This is the bug that made duplicate orders reachable: five separate paths
    // could each deliver success, and checkout finalised on every one.
    const events: CardEvent[] = [
      { type: "sheetSucceeded" },
      { type: "sheetCancelled" },
      { type: "sheetErrored", message: "boom" },
      { type: "returned" },
      { type: "verifyThrew" },
      { type: "verified", result: { state: "failed", reason: "failed" } },
      { type: "open" },
    ];
    for (const event of events) {
      expect(cardReducer(settled, event), event.type).toBe(settled);
    }
  });

  it("only an explicit reset clears it", () => {
    expect(cardReducer(settled, { type: "reset" })).toEqual({ kind: "idle" });
  });
});

describe("double taps and stray callbacks", () => {
  it("opening twice does not restart the sheet", () => {
    const once = run([{ type: "open" }]);
    expect(cardReducer(once, { type: "open" })).toBe(once);
  });

  it("open is ignored while verifying", () => {
    // The old screen left the Pay button live during finalisation, so a second
    // tap reopened the sheet on a reference already being settled.
    const verifying = run([{ type: "open" }, { type: "sheetSucceeded" }]);
    expect(cardReducer(verifying, { type: "open" })).toBe(verifying);
  });

  it("a cancel arriving after success does not undo it", () => {
    // Real webviews fire onCancel as they tear down following a success.
    const verifying = run([{ type: "open" }, { type: "sheetSucceeded" }]);
    expect(cardReducer(verifying, { type: "sheetCancelled" })).toBe(verifying);
  });

  it("a cancel from an open sheet is a cancel", () => {
    expect(run([{ type: "open" }, { type: "sheetCancelled" }])).toEqual({
      kind: "cancelled",
    });
  });

  it("an error after success does not undo it either", () => {
    const verifying = run([{ type: "open" }, { type: "sheetSucceeded" }]);
    expect(
      cardReducer(verifying, { type: "sheetErrored", message: "late" }),
    ).toBe(verifying);
  });

  it("an empty error message still says something useful", () => {
    const state = run([{ type: "open" }, { type: "sheetErrored", message: "  " }]);
    expect(state.kind).toBe("failed");
    expect(describeCardState(state)).toMatch(/Nothing has been charged/);
  });
});

describe("coming back to the foreground", () => {
  it("verifies when a payment is outstanding", () => {
    // The reason the AppState listener exists at all: the customer left to
    // approve an M-Pesa push and came back.
    expect(run([{ type: "open" }, { type: "returned" }])).toEqual({
      kind: "verifying",
      attempt: 1,
    });
  });

  it("re-asks when a charge was left confirming", () => {
    expect(cardReducer({ kind: "pending" }, { type: "returned" })).toEqual({
      kind: "verifying",
      attempt: 1,
    });
  });

  it("an ordinary foreground with nothing in flight starts nothing", () => {
    for (const state of [
      { kind: "idle" },
      { kind: "cancelled" },
      { kind: "failed", message: "x" },
    ] as CardState[]) {
      expect(cardReducer(state, { type: "returned" }), state.kind).toBe(state);
    }
  });
});

describe("the poll budget is bounded", () => {
  it("a pending charge is re-asked, spending one attempt each time", () => {
    let state = run([{ type: "open" }, { type: "sheetSucceeded" }]);
    expect(state).toEqual({ kind: "verifying", attempt: 1 });
    state = cardReducer(state, {
      type: "verified",
      result: { state: "pending" },
    });
    expect(state).toEqual({ kind: "verifying", attempt: 2 });
  });

  it("running out of attempts lands on pending, NEVER on failed", () => {
    // The single most important case here. We have no evidence the payment
    // failed, and the webhook settles it regardless — so claiming failure would
    // tell a customer who has been charged that they have not been.
    let state: CardState = { kind: "verifying", attempt: 1 };
    for (let i = 0; i < MAX_VERIFY_ATTEMPTS + 3; i += 1) {
      state = cardReducer(state, {
        type: "verified",
        result: { state: "pending" },
      });
    }
    expect(state).toEqual({ kind: "pending" });
  });

  it("a network failure spends an attempt but is not a verdict", () => {
    const state = cardReducer(
      { kind: "verifying", attempt: 2 },
      { type: "verifyThrew" },
    );
    expect(state).toEqual({ kind: "verifying", attempt: 3 });
  });

  it("repeated network failures also land on pending, not failed", () => {
    let state: CardState = { kind: "verifying", attempt: 1 };
    for (let i = 0; i < MAX_VERIFY_ATTEMPTS + 3; i += 1) {
      state = cardReducer(state, { type: "verifyThrew" });
    }
    expect(state).toEqual({ kind: "pending" });
  });

  it("a verdict arriving outside verifying is ignored", () => {
    for (const state of [
      { kind: "idle" },
      { kind: "opening" },
      { kind: "cancelled" },
    ] as CardState[]) {
      expect(
        cardReducer(state, {
          type: "verified",
          result: { state: "successful", orderIds: ["o1"] },
        }),
        state.kind,
      ).toBe(state);
    }
  });
});

describe("nextPollDelay", () => {
  it("grows, and the first wait is the short one", () => {
    const delays = [1, 2, 3, 4, 5].map(nextPollDelay);
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000]);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it("is bounded above rather than running off the end of the table", () => {
    // An out-of-range index returning undefined makes setTimeout(NaN), which
    // fires immediately and forever.
    for (const attempt of [6, 40, 1e6]) {
      expect(nextPollDelay(attempt)).toBe(15_000);
    }
  });

  it("never returns a non-finite delay, whatever it is handed", () => {
    for (const attempt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      const delay = nextPollDelay(attempt);
      expect(Number.isFinite(delay), String(attempt)).toBe(true);
      expect(delay).toBeGreaterThan(0);
    }
  });

  it("the whole budget is under a minute", () => {
    const total = Array.from({ length: MAX_VERIFY_ATTEMPTS }, (_, i) =>
      nextPollDelay(i + 1),
    ).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(60_000);
  });
});

describe("resolveVerification", () => {
  it("unverifiable is distinguishable from failed, and says why", () => {
    // PAYSTACK_SECRET_KEY unset. The old client treated this as a slow charge:
    // 45s of polling then silence, so a misconfigured deployment looked like a
    // sluggish one.
    const state = resolveVerification({ state: "unverifiable" }, 1);
    expect(state.kind).toBe("failed");
    expect(describeCardState(state)).toMatch(/not configured for payments/);
    expect(describeCardState(state)).not.toEqual(
      describeCardState(
        resolveVerification({ state: "failed", reason: "failed" }, 1),
      ),
    );
  });

  it("every terminal message promises nothing was charged", () => {
    for (const result of [
      { state: "failed", reason: "failed" },
      { state: "failed", reason: "abandoned" },
      { state: "unverifiable" },
    ] as const) {
      const message = describeCardState(resolveVerification(result, 1));
      expect(message, result.state).toMatch(/[Nn]othing has been charged/);
    }
  });

  it("an abandoned charge is worded differently from a declined one", () => {
    const abandoned = resolveVerification(
      { state: "failed", reason: "abandoned" },
      1,
    );
    const declined = resolveVerification(
      { state: "failed", reason: "failed" },
      1,
    );
    expect(describeCardState(abandoned)).not.toEqual(
      describeCardState(declined),
    );
  });

  it("carries the order ids through on success", () => {
    expect(
      resolveVerification({ state: "successful", orderIds: ["a", "b"] }, 3),
    ).toEqual({ kind: "settled", orderIds: ["a", "b"] });
  });

  it("a success with no order ids still settles", () => {
    // Settlement is idempotent server-side and the webhook may have written the
    // orders already. Treating this as a failure would strand a paid customer.
    expect(
      resolveVerification({ state: "successful", orderIds: [] }, 1),
    ).toEqual({ kind: "settled", orderIds: [] });
  });
});

describe("what the screen shows", () => {
  it("pending never reads as an error", () => {
    const message = describeCardState({ kind: "pending" })!;
    expect(message).toMatch(/being confirmed/);
    expect(message).not.toMatch(/failed|error|wrong|declined/i);
    // And it tells them where the order will turn up.
    expect(message).toMatch(/Orders/);
  });

  it("idle and settled say nothing — the screen has navigated on", () => {
    expect(describeCardState({ kind: "idle" })).toBeNull();
    expect(describeCardState({ kind: "settled", orderIds: [] })).toBeNull();
  });

  it("a cancel reassures about the basket", () => {
    expect(describeCardState({ kind: "cancelled" })).toMatch(/basket/);
  });
});

describe("the button and spinner predicates", () => {
  it("in flight exactly while a sheet is open or we are asking", () => {
    expect(isInFlight({ kind: "opening" })).toBe(true);
    expect(isInFlight({ kind: "verifying", attempt: 1 })).toBe(true);
    for (const state of [
      { kind: "idle" },
      { kind: "settled", orderIds: [] },
      { kind: "pending" },
      { kind: "failed", message: "x" },
      { kind: "cancelled" },
    ] as CardState[]) {
      expect(isInFlight(state), state.kind).toBe(false);
    }
  });

  it("payable only from a resting, retryable state", () => {
    expect(canPay({ kind: "idle" })).toBe(true);
    expect(canPay({ kind: "cancelled" })).toBe(true);
    expect(canPay({ kind: "failed", message: "x" })).toBe(true);
    // Never while in flight, and never once paid.
    expect(canPay({ kind: "opening" })).toBe(false);
    expect(canPay({ kind: "verifying", attempt: 1 })).toBe(false);
    expect(canPay({ kind: "settled", orderIds: [] })).toBe(false);
    // And not while a charge is confirming — paying again would double-charge.
    expect(canPay({ kind: "pending" })).toBe(false);
  });
});
