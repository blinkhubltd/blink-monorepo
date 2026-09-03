import { describe, expect, it } from "vitest";

import {
  parseAgentCodeFromReferrer,
  playStoreReferrerParam,
} from "../lib/install-attribution";

describe("playStoreReferrerParam", () => {
  it("builds a query-string-shaped referrer value", () => {
    expect(playStoreReferrerParam("BLK-1234")).toBe("blink_ref=BLK-1234");
  });

  it("URL-encodes the code and trims it", () => {
    expect(playStoreReferrerParam("  BLK 1234&x=1  ")).toBe(
      "blink_ref=BLK%201234%26x%3D1",
    );
  });
});

describe("parseAgentCodeFromReferrer", () => {
  it("recovers the code from a referrer built by playStoreReferrerParam", () => {
    const referrer = playStoreReferrerParam("BLK-1234");
    expect(parseAgentCodeFromReferrer(referrer)).toBe("BLK-1234");
  });

  it("is null for no referrer at all — an organic install", () => {
    expect(parseAgentCodeFromReferrer(null)).toBeNull();
    expect(parseAgentCodeFromReferrer(undefined)).toBeNull();
    expect(parseAgentCodeFromReferrer("")).toBeNull();
  });

  it("is null when blink_ref is absent — some other campaign's referrer", () => {
    expect(parseAgentCodeFromReferrer("utm_source=google&utm_medium=cpc")).toBeNull();
  });

  it("finds blink_ref alongside other params, in either position", () => {
    expect(
      parseAgentCodeFromReferrer("utm_source=poster&blink_ref=BLK-9999"),
    ).toBe("BLK-9999");
    expect(
      parseAgentCodeFromReferrer("blink_ref=BLK-9999&utm_source=poster"),
    ).toBe("BLK-9999");
  });

  it("decodes a URL-encoded code correctly", () => {
    expect(parseAgentCodeFromReferrer("blink_ref=BLK%201234")).toBe(
      "BLK 1234",
    );
  });

  it("is null for an empty blink_ref value", () => {
    expect(parseAgentCodeFromReferrer("blink_ref=")).toBeNull();
  });

  it("is null for a value longer than a real code could be — the same bound /referral's own field enforces", () => {
    expect(
      parseAgentCodeFromReferrer(`blink_ref=${"A".repeat(33)}`),
    ).toBeNull();
    expect(
      parseAgentCodeFromReferrer(`blink_ref=${"A".repeat(32)}`),
    ).not.toBeNull();
  });

  it("never throws on garbage input", () => {
    for (const input of ["not a query string at all", "===", "%%%", "🎉🎉🎉"]) {
      expect(() => parseAgentCodeFromReferrer(input)).not.toThrow();
    }
  });
});
