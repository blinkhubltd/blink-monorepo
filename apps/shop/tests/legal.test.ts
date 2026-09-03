import { describe, expect, it } from "vitest";

import {
  LEGAL_DOCS,
  LEGAL_DOC_META,
  isLegalConfigured,
  isLegalDoc,
  legalBaseUrl,
  legalUrl,
} from "../lib/legal";

const UNCONFIGURED = "https://legal.blink.invalid";

describe("legalBaseUrl", () => {
  it("falls back to the .invalid placeholder when nothing is configured", () => {
    // Not a real fallback on purpose — https://blink.app used to be here and
    // silently redirects to an unrelated company (bl.ink). `.invalid` is the
    // RFC 2606 TLD reserved to never resolve on the real internet, so this
    // constant can never again accidentally point at somebody else's business.
    expect(legalBaseUrl(undefined)).toBe(UNCONFIGURED);
  });

  it("falls back on a blank value, which is what an empty EAS variable gives", () => {
    expect(legalBaseUrl("")).toBe(UNCONFIGURED);
    expect(legalBaseUrl("   ")).toBe(UNCONFIGURED);
  });

  it("strips trailing slashes so the joined path never doubles them", () => {
    expect(legalBaseUrl("https://staging.blink.app/")).toBe(
      "https://staging.blink.app",
    );
    expect(legalBaseUrl("https://staging.blink.app///")).toBe(
      "https://staging.blink.app",
    );
  });

  it("refuses a non-https base rather than upgrading it silently", () => {
    expect(legalBaseUrl("http://blink.app")).toBe(UNCONFIGURED);
    // A bare host is not a URL openURL can use, so it must not be returned.
    expect(legalBaseUrl("blink.app")).toBe(UNCONFIGURED);
  });
});

describe("isLegalConfigured", () => {
  it("is false with nothing configured", () => {
    expect(isLegalConfigured(undefined)).toBe(false);
    expect(isLegalConfigured("")).toBe(false);
    expect(isLegalConfigured("   ")).toBe(false);
  });

  it("is false for a rejected override — never claims 'configured' for a value legalBaseUrl discarded", () => {
    expect(isLegalConfigured("http://blink.app")).toBe(false);
    expect(isLegalConfigured("blink.app")).toBe(false);
  });

  it("is true for a real https override", () => {
    expect(isLegalConfigured("https://staging.blink.app")).toBe(true);
  });
});

describe("legalUrl", () => {
  it("builds one slash between base and path", () => {
    expect(legalUrl("terms", "https://staging.blink.app/")).toBe(
      "https://staging.blink.app/legal/terms-of-service",
    );
  });

  it("produces an absolute https URL for every document, even unconfigured", () => {
    // legalUrl never throws — a caller that forgets to check
    // isLegalConfigured still gets a syntactically valid (if unreachable) URL,
    // rather than a crash mid-render.
    for (const doc of LEGAL_DOCS) {
      expect(legalUrl(doc)).toMatch(/^https:\/\/[^/]+\/legal\/[a-z-]+$/);
    }
  });

  it("gives every document a distinct URL", () => {
    const urls = LEGAL_DOCS.map((doc) => legalUrl(doc));
    expect(new Set(urls).size).toBe(LEGAL_DOCS.length);
  });
});

describe("metadata", () => {
  it("covers every document, with a leading-slash path and a version key", () => {
    for (const doc of LEGAL_DOCS) {
      const meta = LEGAL_DOC_META[doc];
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.path.startsWith("/")).toBe(true);
      // The version key is what acceptance is recorded against; a mismatch here
      // would record agreement to one document under another's version.
      expect(meta.versionKey).toBe(`${doc}_version`);
    }
  });
});

describe("isLegalDoc", () => {
  it("accepts the three documents and nothing else", () => {
    expect(isLegalDoc("terms")).toBe(true);
    expect(isLegalDoc("privacy")).toBe(true);
    expect(isLegalDoc("eula")).toBe(true);
    expect(isLegalDoc("Terms")).toBe(false);
    expect(isLegalDoc("")).toBe(false);
    expect(isLegalDoc("constructor")).toBe(false);
  });
});
