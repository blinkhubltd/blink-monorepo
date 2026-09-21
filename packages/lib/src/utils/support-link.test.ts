import { describe, expect, it } from "vitest";

import {
  describeSupportLinkProblem,
  normalizeSupportLink,
  supportLinkForOrder,
} from "./support-link";

describe("normalizeSupportLink", () => {
  it("is null when unset or blank, so the button is hidden", () => {
    expect(normalizeSupportLink(undefined)).toBeNull();
    expect(normalizeSupportLink(null)).toBeNull();
    expect(normalizeSupportLink("   ")).toBeNull();
  });

  it("accepts the channels support actually uses, trimmed", () => {
    expect(normalizeSupportLink(" tel:+254700000000 ")).toBe(
      "tel:+254700000000",
    );
    expect(normalizeSupportLink("mailto:help@example.com")).toBe(
      "mailto:help@example.com",
    );
    expect(normalizeSupportLink("https://wa.me/254700000000")).toBe(
      "https://wa.me/254700000000",
    );
  });

  it("refuses schemes a support button has no business opening", () => {
    expect(normalizeSupportLink("http://help.example.com")).toBeNull();
    expect(normalizeSupportLink("javascript:alert(1)")).toBeNull();
    expect(normalizeSupportLink("not a url")).toBeNull();
    expect(normalizeSupportLink("tel:")).toBeNull();
    expect(normalizeSupportLink("https://")).toBeNull();
  });
});

describe("describeSupportLinkProblem", () => {
  it("accepts empty — that clears the link", () => {
    expect(describeSupportLinkProblem("")).toBeNull();
  });

  it("accepts a valid link", () => {
    expect(describeSupportLinkProblem("tel:+254700000000")).toBeNull();
  });

  it("says what to do for the common mistakes", () => {
    expect(describeSupportLinkProblem("0700 000 000")).toMatch(/tel:/);
    expect(describeSupportLinkProblem("0700000000")).toMatch(/Start with/);
    expect(describeSupportLinkProblem("http://help.example.com")).toMatch(
      /https/,
    );
    expect(describeSupportLinkProblem("javascript:alert(1)")).not.toBeNull();
  });
});

describe("supportLinkForOrder", () => {
  const ref = "SHOP_1789985023250_434042-1";

  it("prefills WhatsApp with the order reference", () => {
    const url = supportLinkForOrder("https://wa.me/254700000000", ref)!;
    expect(new URL(url).searchParams.get("text")).toBe(
      `Hi, I need help with order ${ref}.`,
    );
  });

  it("prefills an email subject and body", () => {
    const url = supportLinkForOrder("mailto:help@example.com", ref)!;
    expect(url).toContain(`subject=${encodeURIComponent(`Order ${ref}`)}`);
    expect(url).toContain("body=");
  });

  it("leaves a phone number unchanged", () => {
    expect(supportLinkForOrder("tel:+254700000000", ref)).toBe(
      "tel:+254700000000",
    );
  });

  it("is null when support is not configured", () => {
    expect(supportLinkForOrder("", ref)).toBeNull();
    expect(supportLinkForOrder(null, ref)).toBeNull();
  });
});
