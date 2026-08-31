import { describe, expect, it } from "vitest";

import {
  LEGAL_DOCS,
  LEGAL_DOC_META,
  isLegalDoc,
  legalBaseUrl,
  legalUrl,
} from "../lib/legal";

describe("legalBaseUrl", () => {
  it("falls back when nothing is configured", () => {
    expect(legalBaseUrl(undefined)).toBe("https://blink.app");
  });

  it("falls back on a blank value, which is what an empty EAS variable gives", () => {
    expect(legalBaseUrl("")).toBe("https://blink.app");
    expect(legalBaseUrl("   ")).toBe("https://blink.app");
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
    expect(legalBaseUrl("http://blink.app")).toBe("https://blink.app");
    // A bare host is not a URL openURL can use, so it must not be returned.
    expect(legalBaseUrl("blink.app")).toBe("https://blink.app");
  });
});

describe("legalUrl", () => {
  it("builds one slash between base and path", () => {
    expect(legalUrl("terms", "https://staging.blink.app/")).toBe(
      "https://staging.blink.app/legal/terms-of-service",
    );
  });

  it("produces an absolute https URL for every document", () => {
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
