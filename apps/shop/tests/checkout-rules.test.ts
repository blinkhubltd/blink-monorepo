import { describe, expect, it } from "vitest";
import {
  GPS_UNCERTAINTY_METRES,
  RECEIVER_DISTANCE_THRESHOLD_METRES,
  checkoutBlockers,
  distanceMetres,
  receiverRequirement,
  validateReceiver,
} from "../lib/checkout-rules";

/**
 * Checkout rules.
 *
 * The receiver rule is the one with a real-world failure mode: get it wrong in
 * the permissive direction and a parcel arrives with nobody able to take it;
 * get it wrong in the strict direction and a customer standing at their own
 * front door is asked who is receiving their shopping.
 */

describe("receiverRequirement", () => {
  it("does not require details when the customer is at the address", () => {
    // Well inside the threshold, beyond GPS error.
    const result = receiverRequirement(10);
    expect(result.kind).toBe("at_address");
    expect(result.required).toBe(false);
  });

  it("requires details when the address is clearly elsewhere", () => {
    const result = receiverRequirement(1000);
    expect(result.kind).toBe("away");
    expect(result.required).toBe(true);
  });

  it("requires details when the reading is too close to call", () => {
    // ~100m of GPS error against a 150m threshold means a reading of 140m is
    // not evidence of anything. Asking for a contact the customer may not need
    // is a smaller harm than a parcel nobody can accept.
    for (const reading of [140, 150, 160, 200]) {
      const result = receiverRequirement(reading);
      expect(result.required, `at ${reading}m`).toBe(true);
    }
  });

  it("reports uncertainty rather than asserting a distance it cannot support", () => {
    expect(receiverRequirement(RECEIVER_DISTANCE_THRESHOLD_METRES).kind).toBe(
      "uncertain",
    );
    expect(
      receiverRequirement(
        RECEIVER_DISTANCE_THRESHOLD_METRES + GPS_UNCERTAINTY_METRES + 1,
      ).kind,
    ).toBe("away");
  });

  it("handles an unknown location without silently dropping the rule", () => {
    // The old screen returned false here, so a denied permission or a GPS
    // timeout switched the rule off entirely and nothing said so.
    const result = receiverRequirement(null);
    expect(result.kind).toBe("unknown");
    expect(result.distanceMetres).toBeNull();
  });

  it("treats a non-finite distance as unknown, not as zero", () => {
    expect(receiverRequirement(Number.NaN).kind).toBe("unknown");
    expect(receiverRequirement(Number.POSITIVE_INFINITY).kind).toBe("unknown");
  });
});

describe("validateReceiver", () => {
  it("demands nothing when the rule does not apply", () => {
    expect(validateReceiver("", "", false)).toEqual({});
  });

  it("demands both fields when it does", () => {
    const errors = validateReceiver("", "", true);
    expect(errors.name).toBeDefined();
    expect(errors.phone).toBeDefined();
  });

  it("rejects whitespace as a name", () => {
    expect(validateReceiver("   ", "+254712345678", true).name).toBeDefined();
  });

  it("accepts a phone with spaces or dashes", () => {
    // People type numbers the way they read them.
    expect(
      validateReceiver("A", "+254 712 345 678", true).phone,
    ).toBeUndefined();
    expect(validateReceiver("A", "0712-345-678", true).phone).toBeUndefined();
  });

  it("rejects a number that is too short or not a number", () => {
    expect(validateReceiver("A", "12345", true).phone).toBeDefined();
    expect(validateReceiver("A", "not a phone", true).phone).toBeDefined();
    expect(
      validateReceiver("A", "+2547123456789012345", true).phone,
    ).toBeDefined();
  });
});

describe("distanceMetres", () => {
  it("returns null when either point is missing", () => {
    expect(distanceMetres(null, { lat: 0, lng: 0 })).toBeNull();
    expect(distanceMetres({ lat: 0, lng: 0 }, null)).toBeNull();
  });

  it("returns null rather than NaN for a malformed point", () => {
    // A NaN distance compared against a threshold is always false, which would
    // silently disable the rule.
    expect(
      distanceMetres({ lat: Number.NaN, lng: 0 }, { lat: 0, lng: 0 }),
    ).toBeNull();
  });

  it("is zero for the same point", () => {
    const p = { lat: -1.2921, lng: 36.8219 };
    expect(distanceMetres(p, p)).toBe(0);
  });

  it("is accurate enough at checkout ranges", () => {
    // ~111m per 0.001 degree of latitude in Nairobi.
    const d = distanceMetres(
      { lat: -1.2921, lng: 36.8219 },
      { lat: -1.2931, lng: 36.8219 },
    );
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(120);
  });
});

describe("checkoutBlockers", () => {
  const ok = {
    hasQuote: true,
    hasAddress: true,
    hasPhone: true,
    receiverErrors: {},
    prescriptionStatus: "none" as const,
  };

  it("is empty when everything is in order", () => {
    expect(checkoutBlockers(ok)).toEqual([]);
  });

  it("names each missing thing", () => {
    // The old screen had five disabled-conditions across two buttons and showed
    // the customer none of them — the button simply did nothing.
    expect(checkoutBlockers({ ...ok, hasAddress: false })).toContain(
      "Choose a delivery address",
    );
    expect(checkoutBlockers({ ...ok, hasPhone: false })[0]).toMatch(/phone/);
    expect(checkoutBlockers({ ...ok, hasQuote: false })[0]).toMatch(/empty/);
  });

  it("blocks on a missing or rejected prescription", () => {
    expect(
      checkoutBlockers({ ...ok, prescriptionStatus: "missing" }),
    ).toHaveLength(1);
    expect(
      checkoutBlockers({ ...ok, prescriptionStatus: "rejected" }),
    ).toHaveLength(1);
  });

  it("does NOT block on a pending prescription", () => {
    // Deliberate: the order is placed and held for dispatch. Blocking would
    // mean a customer waiting on a pharmacist cannot check out at all, and the
    // server refuses dispatch without an approved document anyway.
    expect(checkoutBlockers({ ...ok, prescriptionStatus: "pending" })).toEqual(
      [],
    );
    expect(checkoutBlockers({ ...ok, prescriptionStatus: "approved" })).toEqual(
      [],
    );
  });

  it("blocks on receiver errors", () => {
    expect(
      checkoutBlockers({ ...ok, receiverErrors: { name: "required" } }),
    ).toContain("Add the receiver's name and phone");
  });
});
