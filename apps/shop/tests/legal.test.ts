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
const DEFAULT = "https://blink-web-rho.vercel.app";

describe("legalBaseUrl", () => {
  it("uses the live site when nothing overrides it", () => {
    expect(legalBaseUrl(undefined)).toBe(DEFAULT);
  });

  it("uses it on a blank value too, which is what an empty EAS variable gives", () => {
    expect(legalBaseUrl("")).toBe(DEFAULT);
    expect(legalBaseUrl("   ")).toBe(DEFAULT);
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

  it("does NOT fall through to the live site when an override is rejected", () => {
    // The two failure modes are different: nothing configured is the ordinary
    // case and gets production, but a value someone typed wrong must surface
    // as wrong rather than quietly serving the right thing anyway.
    expect(legalBaseUrl("http://blink.app")).not.toBe(DEFAULT);
    expect(legalBaseUrl("blink.app")).not.toBe(DEFAULT);
  });
});

describe("isLegalConfigured", () => {
  it("is true with nothing configured, because the default is a real site", () => {
    expect(isLegalConfigured(undefined)).toBe(true);
    expect(isLegalConfigured("")).toBe(true);
    expect(isLegalConfigured("   ")).toBe(true);
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
      "https://staging.blink.app/terms",
    );
  });

  it("points each document at the route the website actually serves", () => {
    expect(legalUrl("terms")).toBe(`${DEFAULT}/terms`);
    expect(legalUrl("privacy")).toBe(`${DEFAULT}/privacy-policy`);
    expect(legalUrl("eula")).toBe(`${DEFAULT}/eula`);
  });

  it("produces an absolute https URL for every document, even when rejected", () => {
    // legalUrl never throws — a caller that forgets to check
    // isLegalConfigured still gets a syntactically valid (if unreachable) URL,
    // rather than a crash mid-render.
    for (const doc of LEGAL_DOCS) {
      expect(legalUrl(doc, "http://nope")).toMatch(/^https:\/\/[^/]+\/[a-z-]+$/);
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
