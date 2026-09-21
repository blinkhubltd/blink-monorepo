import { describe, expect, it } from "vitest";

import {
  ORDER_TRACK,
  canTransitionOrder,
  checkOrderTransition,
} from "./order-transitions";

const ALL = [...ORDER_TRACK, "Cancelled", "Refunded"] as const;

describe("forward along the track", () => {
  it("allows exactly the next step", () => {
    for (let i = 0; i < ORDER_TRACK.length - 1; i += 1) {
      expect(canTransitionOrder(ORDER_TRACK[i]!, ORDER_TRACK[i + 1]!)).toBe(
        true,
      );
    }
  });

  it("refuses every skip — the case this exists for", () => {
    expect(canTransitionOrder("Confirmed", "Delivered")).toBe(false);
    expect(canTransitionOrder("Confirmed", "Pickup")).toBe(false);
    expect(canTransitionOrder("Pending", "Delivery")).toBe(false);
    expect(canTransitionOrder("Processing", "Delivered")).toBe(false);
  });

  it("names the step that should come next", () => {
    const result = checkOrderTransition("Confirmed", "Delivered");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/next step is Processing/);
  });
});

describe("backwards", () => {
  it("allows one step back to undo a mis-click", () => {
    expect(canTransitionOrder("Pickup", "Processing")).toBe(true);
    expect(canTransitionOrder("Delivery", "Pickup")).toBe(true);
  });

  it("refuses more than one step back", () => {
    expect(canTransitionOrder("Delivery", "Confirmed")).toBe(false);
  });

  it("never un-delivers", () => {
    expect(canTransitionOrder("Delivered", "Delivery")).toBe(false);
    expect(canTransitionOrder("Delivered", "Cancelled")).toBe(false);
  });
});

describe("cancel and refund", () => {
  it("cancels from any live status", () => {
    for (const status of ORDER_TRACK.slice(0, -1)) {
      expect(canTransitionOrder(status, "Cancelled")).toBe(true);
    }
  });

  it("refunds only an order that ended", () => {
    expect(canTransitionOrder("Delivered", "Refunded")).toBe(true);
    expect(canTransitionOrder("Cancelled", "Refunded")).toBe(true);
    expect(canTransitionOrder("Delivery", "Refunded")).toBe(false);
  });

  it("treats Refunded as final and Cancelled as refund-only", () => {
    for (const to of ALL) {
      expect(canTransitionOrder("Refunded", to)).toBe(false);
      expect(canTransitionOrder("Cancelled", to)).toBe(to === "Refunded");
    }
  });
});

describe("edges", () => {
  it("refuses a no-op", () => {
    for (const status of ALL)
      expect(canTransitionOrder(status, status)).toBe(false);
  });

  it("refuses statuses it does not know rather than guessing", () => {
    expect(canTransitionOrder("Confirmed", "Teleported")).toBe(false);
    expect(canTransitionOrder("constructor", "Confirmed")).toBe(false);
  });
});
