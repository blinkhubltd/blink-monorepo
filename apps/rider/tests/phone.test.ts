import { describe, expect, it } from "vitest";
import { maskE164, toE164 } from "../lib/phone";

describe("toE164", () => {
  it("accepts the three forms a rider actually types", () => {
    expect(toE164("712345678")).toBe("+254712345678");
    expect(toE164("0712345678")).toBe("+254712345678");
    expect(toE164("254712345678")).toBe("+254712345678");
  });

  it("ignores spacing and punctuation", () => {
    expect(toE164("0712 345 678")).toBe("+254712345678");
    expect(toE164("+254 712-345-678")).toBe("+254712345678");
  });

  it("rejects the wrong number of digits", () => {
    // Clerk requires E.164; sending the raw input fails with an opaque API
    // error instead of a clear message in the field.
    expect(toE164("71234567")).toBeNull();
    expect(toE164("7123456789")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("abc")).toBeNull();
  });

  it("rejects a subscriber number that still starts with a trunk zero", () => {
    // "00712345678" strips to nine digits beginning 0, which is length-valid but
    // not dialable.
    expect(toE164("00712345678")).toBeNull();
  });
});

describe("maskE164", () => {
  it("shows the first and last three digits", () => {
    expect(maskE164("+254712345678")).toBe("+254 712 ••• 678");
  });

  it("returns the input unchanged when it is too short to mask", () => {
    expect(maskE164("+2547")).toBe("+2547");
  });
});
