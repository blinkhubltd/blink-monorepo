import { describe, expect, it } from "vitest";
import {
  ORDER_JOURNEY,
  ORDER_STATUS,
  isLive,
  presentStatus,
  type OrderStatus,
} from "../lib/order-status";

/**
 * How order statuses are presented.
 *
 * This map is what replaces the Tailwind safelist regex. The old app built class
 * names by interpolation (`bg-${status}-500`), so every colour-scale combination
 * had to be safelisted and a status the code did not expect produced an
 * invisibly unstyled badge. These tests are the reason that regex can be
 * deleted: a missing status is a type error, and an UNKNOWN status has a defined,
 * tested fallback.
 */

/** Every value in the backend's `orderStatus` enum, copied deliberately. */
const BACKEND_STATUSES: OrderStatus[] = [
  "Pending",
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
  "Cancelled",
  "Refunded",
];

describe("ORDER_STATUS covers the backend enum", () => {
  it.each(BACKEND_STATUSES)("has an entry for %s", (status) => {
    expect(ORDER_STATUS[status]).toBeDefined();
  });

  it("has no entries the backend does not produce", () => {
    // Guards the other direction: an entry for a status that cannot occur is
    // dead presentation logic that will drift.
    expect(Object.keys(ORDER_STATUS).sort()).toEqual(
      [...BACKEND_STATUSES].sort(),
    );
  });

  it("gives every status customer-facing wording, not the raw name", () => {
    // "Processing" means nothing to a shopper; "Being picked" does.
    for (const status of BACKEND_STATUSES) {
      const presented = ORDER_STATUS[status];
      expect(presented.label.length).toBeGreaterThan(0);
      if (presented.step !== null) {
        expect(presented.helper.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the progress track", () => {
  it("only contains statuses that have a step", () => {
    for (const status of ORDER_JOURNEY) {
      expect(ORDER_STATUS[status].step).not.toBeNull();
    }
  });

  it("numbers steps consecutively along the journey", () => {
    // A gap or a repeat would render a track where one node never lights up.
    const steps = ORDER_JOURNEY.map((s) => ORDER_STATUS[s].step);
    expect(steps).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves terminal failures off the track", () => {
    // Drawing five steps none of which are reachable is worse than drawing none.
    expect(ORDER_STATUS.Cancelled.step).toBeNull();
    expect(ORDER_STATUS.Refunded.step).toBeNull();
    expect(ORDER_JOURNEY).not.toContain("Cancelled");
    expect(ORDER_JOURNEY).not.toContain("Refunded");
  });

  it("ends at Delivered", () => {
    expect(ORDER_JOURNEY[ORDER_JOURNEY.length - 1]).toBe("Delivered");
  });
});

describe("presentStatus", () => {
  it("returns the mapped presentation for a known status", () => {
    expect(presentStatus("Delivery").label).toBe("On the way");
  });

  it("falls back to the raw name for an unknown status", () => {
    // A status added server-side before this map is updated is a real
    // possibility. Showing its raw name is honest; guessing a colour is not.
    const presented = presentStatus("Quantum Superposition");
    expect(presented.label).toBe("Quantum Superposition");
    expect(presented.step).toBeNull();
    expect(presented.variant).toBe("secondary");
  });

  it("never returns an undefined variant", () => {
    // This is the property that made the safelist necessary: an undefined
    // variant produced no class at all, so the badge rendered invisible.
    for (const input of ["Delivered", "", "nonsense", "delivered"]) {
      expect(presentStatus(input).variant).toBeTruthy();
    }
  });

  it("is case sensitive, matching the backend exactly", () => {
    // The enum is capitalised. A lowercase value is not a known status, and
    // silently accepting it would hide a real mismatch.
    expect(presentStatus("delivered").label).toBe("delivered");
  });
});

describe("isLive", () => {
  it("is false once an order reaches a terminal state", () => {
    expect(isLive("Delivered")).toBe(false);
    expect(isLive("Cancelled")).toBe(false);
    expect(isLive("Refunded")).toBe(false);
  });

  it("is true while an order is still expected", () => {
    for (const status of [
      "Pending",
      "Confirmed",
      "Processing",
      "Pickup",
      "Delivery",
    ]) {
      expect(isLive(status), status).toBe(true);
    }
  });

  it("treats an unknown status as live", () => {
    // Erring toward "still coming" keeps a tracking link available rather than
    // filing an order away as finished when nobody knows that it is.
    expect(isLive("Something New")).toBe(true);
  });
});

describe("presentStatus and inherited keys", () => {
  it("does not return a prototype member as a presentation", () => {
    // A bare index on an object literal resolves "constructor" to
    // Object.prototype.constructor — truthy, so a `??` fallback never fires and
    // the badge renders undefined.
    for (const key of ["constructor", "toString", "hasOwnProperty"]) {
      const presentation = presentStatus(key);
      expect(presentation.label, key).toBe(key);
      expect(presentation.variant, key).toBe("secondary");
      expect(presentation.step, key).toBeNull();
    }
  });
});
