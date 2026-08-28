/**
 * Legal documents, as data.
 *
 * ── Why data rather than three screens ───────────────────────────────────
 *
 * blink-ecommerce shipped `privacy-policy.tsx` (973 lines), `terms-of-service.tsx`
 * (824) and `eula.tsx` (802) — 2,599 lines of JSX whose only job was to render
 * static prose, and which between them accounted for 78 of the `space=` prop
 * sites the migration has to convert. Three files, one behaviour.
 *
 * As data there is one renderer, the conversion cost is zero, and the text can
 * be edited by someone who does not write React.
 *
 * ── The version matters ─────────────────────────────────────────────────
 *
 * `platform_settings` holds `terms_version`, `privacy_version` and
 * `eula_version`, and bumping one forces re-acceptance. The old checkout
 * recorded acceptance against hardcoded `"v1.0"` literals rather than reading
 * those settings, so a bump would have been recorded against the wrong version —
 * or rather, every acceptance would claim v1.0 forever. The version shown here
 * comes from the settings, so what a customer reads and what is recorded agree.
 */

export type LegalDoc = "terms" | "privacy" | "eula";

export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered in order, no markup. */
  body: string[];
}

export interface LegalDocument {
  title: string;
  /** Which `platform_settings` key carries this document's version. */
  versionKey: "terms_version" | "privacy_version" | "eula_version";
  sections: LegalSection[];
}

/**
 * PLACEHOLDER BODIES.
 *
 * The structure is real and the renderer is finished, but the prose has NOT been
 * ported from blink-ecommerce — 2,599 lines of it, and legal text that is
 * paraphrased or half-copied is worse than legal text that is honestly absent.
 * Porting it is a copy-paste task for whoever owns the wording, and the shape
 * below is what it slots into.
 */
export const LEGAL_DOCUMENTS: Record<LegalDoc, LegalDocument> = {
  terms: {
    title: "Terms of service",
    versionKey: "terms_version",
    sections: [
      {
        heading: "Not yet published here",
        body: [
          "The full terms have not been carried into this version of the app yet.",
          "Until they are, the terms you agreed to when you created your account continue to apply. Contact support if you need a copy.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    versionKey: "privacy_version",
    sections: [
      {
        heading: "Not yet published here",
        body: [
          "The full privacy policy has not been carried into this version of the app yet.",
          "In summary, and pending the full text: we collect your delivery address and location to work out which shops can reach you, your phone number so a rider can contact you, and your order history. Contact support for the complete policy.",
        ],
      },
    ],
  },
  eula: {
    title: "Licence terms",
    versionKey: "eula_version",
    sections: [
      {
        heading: "Not yet published here",
        body: [
          "The licence terms have not been carried into this version of the app yet.",
        ],
      },
    ],
  },
};

export function isLegalDoc(value: string): value is LegalDoc {
  return value === "terms" || value === "privacy" || value === "eula";
}
