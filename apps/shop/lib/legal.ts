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
 * ── The base URL, and why there is no real fallback ───────────────────────
 *
 * `EXPO_PUBLIC_LEGAL_BASE_URL` overrides it, so staging can point at staging.
 * There used to be a hardcoded fallback of `https://blink.app` for when it was
 * unset — checked once, that domain redirects to `bl.ink`, an unrelated
 * company. A customer tapping "Terms" with no env var configured would have
 * been silently sent to a stranger's website, and `openExternal` would have
 * reported success, because the browser genuinely did open a page.
 *
 * There is no real production site yet, so there is no real fallback to give.
 * `UNCONFIGURED_BASE_URL` is a placeholder built on the `.invalid` TLD — the
 * one reserved by RFC 2606 specifically to never resolve on the real internet
 * — so this constant can never again accidentally point at somebody else's
 * business. `isLegalConfigured` is the actual guard: callers check it BEFORE
 * attempting to open anything, rather than hoping the open fails. Opening a
 * `.invalid` URL still "succeeds" by `openExternal`'s own contract — the
 * browser tab launches — so relying on that path returning false would have
 * repeated the exact silent-wrong-destination bug this replaces.
 *
 * The paths below must match the website's actual routes, once one exists.
 * They are asserted against nothing — no test can reach a site that does not
 * exist — so they are kept in one place where they can be fixed once.
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

/**
 * Placeholder only. See the module comment — this is deliberately not a real
 * website, so a caller that forgets to check `isLegalConfigured` fails
 * obviously (a `.invalid` host in a URL bar) rather than plausibly (a real
 * page that just happens to belong to someone else).
 */
const UNCONFIGURED_BASE_URL = "https://legal.blink.invalid";

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
  if (!trimmed) return UNCONFIGURED_BASE_URL;
  if (!/^https:\/\//i.test(trimmed)) {
    // http:// is refused rather than upgraded: a legal document fetched over a
    // connection anyone can rewrite is not evidence of anything, and silently
    // upgrading hides a misconfiguration that should be visible.
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
