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
 * ── The base URL ─────────────────────────────────────────────────────────
 *
 * `EXPO_PUBLIC_LEGAL_BASE_URL` overrides it, so staging can point at staging;
 * otherwise it is the production site. Deliberately NOT a required EAS var: a
 * missing website URL should not fail a build, and the fallback is a real,
 * correct address rather than a placeholder.
 *
 * The paths below must match the website's actual routes. They are asserted
 * against nothing — no test can reach the site — so they are kept in one place
 * where a redirect can be fixed once.
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
    path: "/legal/terms-of-service",
    versionKey: "terms_version",
  },
  privacy: {
    title: "Privacy policy",
    path: "/legal/privacy-policy",
    versionKey: "privacy_version",
  },
  eula: {
    title: "Licence terms",
    path: "/legal/eula",
    versionKey: "eula_version",
  },
} as const satisfies Record<LegalDoc, LegalDocMeta>;

const FALLBACK_BASE_URL = "https://blink.app";

/**
 * Resolve the base URL.
 *
 * A trailing slash on the env var would otherwise produce `//legal/...`, which
 * some servers treat as a protocol-relative path and others 404. Trimmed rather
 * than trusted. An env var that is present but blank — which is what an EAS
 * variable defined with no value gives you — falls back rather than producing
 * a relative URL that `openURL` rejects.
 */
export function legalBaseUrl(
  override: string | undefined = process.env.EXPO_PUBLIC_LEGAL_BASE_URL,
): string {
  const trimmed = (override ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return FALLBACK_BASE_URL;
  if (!/^https:\/\//i.test(trimmed)) {
    // http:// is refused rather than upgraded: a legal document fetched over a
    // connection anyone can rewrite is not evidence of anything, and silently
    // upgrading hides a misconfiguration that should be visible.
    return FALLBACK_BASE_URL;
  }
  return trimmed;
}

export function legalUrl(doc: LegalDoc, override?: string): string {
  return `${legalBaseUrl(override)}${LEGAL_DOC_META[doc].path}`;
}

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}
