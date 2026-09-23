/**
 * Legal documents live on the website, not in the app.
 *
 * ── Why a link and not a screen ──────────────────────────────────────────
 *
 * blink-ecommerce shipped `privacy-policy.tsx` (973 lines), `terms-of-service.tsx`
 * (824) and `eula.tsx` (802): 2,599 lines of JSX whose only job was to render
 * static prose, which meant every wording change was an app release and a store
 * review. Legal text that is one release behind is worse than no text at all,
 * because the app then contradicts the document the customer actually agreed to.
 *
 * The website is the single copy. This module holds where it is.
 *
 * ── The base URL, and the two different kinds of "no URL" ─────────────────
 *
 * `DEFAULT_BASE_URL` is the real site. It used to be `https://blink.app`,
 * which — checked once — redirects to `bl.ink`, an unrelated company: a
 * customer tapping "Terms" was silently sent to a stranger's website, and
 * `openExternal` reported success because the browser genuinely did open a
 * page. For a while after that there was no production site at all, so the
 * default was a deliberately dead `.invalid` host and every link was gated.
 * There is one now, so the default is real again.
 *
 * `EXPO_PUBLIC_LEGAL_BASE_URL` still overrides it, so staging can point at
 * staging and a custom domain can replace the Vercel one without a release.
 *
 * The two cases are kept apart on purpose:
 *
 *   - NOT SET (or blank, which is what an empty EAS variable gives) is the
 *     ordinary case. It resolves to the real site.
 *   - SET BUT REJECTED — `http://`, or a bare host — resolves to
 *     `UNCONFIGURED_BASE_URL`, a `.invalid` host RFC 2606 reserves so it can
 *     never resolve on the real internet. Someone configured this wrong, and
 *     quietly serving production instead would hide exactly the
 *     misconfiguration that needs to be visible.
 *
 * `isLegalConfigured` is what callers check BEFORE opening anything, because
 * opening a `.invalid` URL still "succeeds" by `openExternal`'s contract —
 * the browser tab launches — so waiting for the open to fail would repeat
 * the original silent-wrong-destination bug.
 *
 * The paths below must match the website's actual routes. They are asserted
 * against nothing — no test here can reach the site — so they are kept in one
 * place where they can be fixed once.
 */

export const LEGAL_DOCS = ["terms", "privacy", "eula"] as const;

export type LegalDoc = (typeof LEGAL_DOCS)[number];

interface LegalDocMeta {
  /** Row label in the app. */
  title: string;
  /** Path on the website, leading slash included. */
  path: string;
  /** Which `platform_settings` key carries the version acceptance is recorded against. */
  versionKey: "terms_version" | "privacy_version" | "eula_version";
}

export const LEGAL_DOC_META = {
  terms: {
    title: "Terms of service",
    path: "/terms",
    versionKey: "terms_version",
  },
  privacy: {
    title: "Privacy policy",
    path: "/privacy-policy",
    versionKey: "privacy_version",
  },
  eula: {
    title: "EULA",
    path: "/eula",
    versionKey: "eula_version",
  },
} as const satisfies Record<LegalDoc, LegalDocMeta>;

/**
 * The live site, used when nothing overrides it.
 *
 * A Vercel project URL rather than a custom domain, which is what exists
 * today. `EXPO_PUBLIC_LEGAL_BASE_URL` is how that gets replaced later without
 * shipping a release.
 */
const DEFAULT_BASE_URL = "https://blink-web-rho.vercel.app";

/**
 * Where a REJECTED override lands — not where an absent one does.
 *
 * `.invalid` is the RFC 2606 TLD reserved to never resolve, so a bad
 * configuration fails obviously (an impossible host in the URL bar, behind a
 * guard that stops the tab opening at all) rather than plausibly.
 */
const UNCONFIGURED_BASE_URL = "https://legal.blink.invalid";

/**
 * Resolve the base URL.
 *
 * A trailing slash on the env var would otherwise produce `//terms`, which
 * some servers treat as a protocol-relative path and others 404. Trimmed
 * rather than trusted.
 */
export function legalBaseUrl(
  override: string | undefined = process.env.EXPO_PUBLIC_LEGAL_BASE_URL,
): string {
  const trimmed = (override ?? "").trim().replace(/\/+$/, "");
  // Unset or blank — the ordinary case, including an EAS variable defined
  // with no value. The real site, not a failure.
  if (!trimmed) return DEFAULT_BASE_URL;
  if (!/^https:\/\//i.test(trimmed)) {
    // http:// is refused rather than upgraded: a legal document fetched over a
    // connection anyone can rewrite is not evidence of anything. It does not
    // fall through to the default either — someone set this deliberately, and
    // quietly ignoring them hides the misconfiguration.
    return UNCONFIGURED_BASE_URL;
  }
  return trimmed;
}

export function legalUrl(doc: LegalDoc, override?: string): string {
  return `${legalBaseUrl(override)}${LEGAL_DOC_META[doc].path}`;
}

/**
 * Whether a real legal site is configured.
 *
 * Callers must check this BEFORE calling `openExternal` on a legal link — see
 * the module comment for why waiting for the open itself to fail does not
 * work.
 */
export function isLegalConfigured(
  override: string | undefined = process.env.EXPO_PUBLIC_LEGAL_BASE_URL,
): boolean {
  return legalBaseUrl(override) !== UNCONFIGURED_BASE_URL;
}

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}
