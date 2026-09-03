import { describe, expect, it } from "vitest";

import {
  addressBlockers,
  cleanLines,
  formatPoint,
  isUsablePoint,
  labelProblem,
  normaliseLabel,
  replacementFor,
  summariseAddress,
} from "../lib/address";

describe("normaliseLabel", () => {
  it("trims and collapses whitespace, matching the server", () => {
    expect(normaliseLabel("  Home  ")).toBe("Home");
    expect(normaliseLabel("My   second   place")).toBe("My second place");
  });
});

describe("labelProblem", () => {
  it("rejects blank, including whitespace-only", () => {
    expect(labelProblem("")).toBe("empty");
    expect(labelProblem("   ")).toBe("empty");
  });

  it("rejects over 40 characters, measured after normalising", () => {
    expect(labelProblem("a".repeat(40))).toBeNull();
    expect(labelProblem("a".repeat(41))).toBe("too-long");
    // Padding is not length: trimming happens first.
    expect(labelProblem(`   ${"a".repeat(40)}   `)).toBeNull();
  });
});

describe("replacementFor", () => {
  const existing = [{ label: "Home" }, { label: "Work" }];

  it("finds the entry a save would overwrite", () => {
    expect(replacementFor("Home", existing)).toBe("Home");
  });

  it("matches across case and padding, because a person means the same place", () => {
    // Both of these WOULD create a second entry on the server; warning is the
    // honest reading of the intent.
    expect(replacementFor("home", existing)).toBe("Home");
    expect(replacementFor("  HOME ", existing)).toBe("Home");
  });

  it("returns null for a genuinely new label", () => {
    expect(replacementFor("Mum's", existing)).toBeNull();
  });

  it("returns null for a blank label rather than matching anything", () => {
    expect(replacementFor("   ", existing)).toBeNull();
    expect(replacementFor("", [{ label: "" }])).toBeNull();
  });
});

describe("isUsablePoint", () => {
  it("accepts a real Nairobi point", () => {
    expect(isUsablePoint({ lat: -1.2921, lng: 36.8219 })).toBe(true);
  });

  it("rejects null, NaN and Infinity", () => {
    expect(isUsablePoint(null)).toBe(false);
    expect(isUsablePoint({ lat: Number.NaN, lng: 36.8 })).toBe(false);
    expect(isUsablePoint({ lat: -1.29, lng: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });

  it("rejects 0,0 — an uninitialised state variable, not a location", () => {
    expect(isUsablePoint({ lat: 0, lng: 0 })).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(isUsablePoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isUsablePoint({ lat: 0, lng: -181 })).toBe(false);
  });

  it("accepts a valid point on one axis' zero", () => {
    // The Equator is a real place; only the pair 0,0 is the sentinel.
    expect(isUsablePoint({ lat: 0, lng: 36.8 })).toBe(true);
  });
});

describe("cleanLines", () => {
  it("turns blank boxes into absent fields, not empty strings", () => {
    expect(
      cleanLines({ address_1: "  ", address_2: "Flat 4", city: "", country: "" }),
    ).toEqual({
      address_1: undefined,
      address_2: "Flat 4",
      city: undefined,
      country: undefined,
    });
  });
});

describe("addressBlockers", () => {
  const point = { lat: -1.2921, lng: 36.8219 };

  it("is empty when everything is in order", () => {
    expect(
      addressBlockers({ label: "Home", point, covered: true }),
    ).toEqual([]);
  });

  it("reports a missing name and a missing pin together", () => {
    const blockers = addressBlockers({ label: "", point: null, covered: null });
    expect(blockers).toHaveLength(2);
  });

  it("reports coverage before the form is submitted", () => {
    const blockers = addressBlockers({ label: "Home", point, covered: false });
    expect(blockers.join(" ")).toMatch(/No shop delivers/);
  });

  it("does not claim uncovered while the check is still in flight", () => {
    // `null` is "not answered yet". Treating it as false would tell a customer
    // we do not deliver to them every time the screen opens.
    expect(addressBlockers({ label: "Home", point, covered: null })).toEqual([]);
  });

  it("does not report coverage when there is no point to check", () => {
    const blockers = addressBlockers({
      label: "Home",
      point: null,
      covered: false,
    });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/Pick the spot/);
  });
});

describe("summariseAddress", () => {
  it("joins what is present", () => {
    expect(
      summariseAddress({ address_1: "Ngong Road", city: "Nairobi" }),
    ).toBe("Ngong Road, Nairobi");
  });

  it("says so rather than rendering an empty line", () => {
    expect(summariseAddress(undefined)).toBe("No street details");
    expect(summariseAddress({ address_1: "   " })).toBe("No street details");
  });
});

describe("formatPoint", () => {
  it("prints five decimals, about a metre", () => {
    expect(formatPoint({ lat: -1.29213456, lng: 36.82191234 })).toBe(
      "-1.29213, 36.82191",
    );
  });

  it("says Not set rather than 0.00000, 0.00000", () => {
    expect(formatPoint(null)).toBe("Not set");
    expect(formatPoint({ lat: 0, lng: 0 })).toBe("Not set");
  });
});
