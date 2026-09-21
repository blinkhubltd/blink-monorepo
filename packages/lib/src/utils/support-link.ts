/**
 * The customer support link: what counts as a valid one, and how an order is
 * attached to it.
 *
 * Set by a super admin on the dashboard's settings page (platform setting
 * `support_url`) and read by the shop's tracking screen. Shared so the three
 * places that care agree exactly:
 *
 *   - the admin form, to reject a bad link as it is typed;
 *   - `platform_settings.upsert`, to refuse one that got past the form;
 *   - the shop, which re-checks on read and hides the button rather than
 *     opening something broken.
 *
 * Accepted, one per deployment:
 *
 *   tel:+254700000000            a phone line
 *   https://wa.me/254700000000   WhatsApp
 *   mailto:support@example.com   email
 *   https://help.example.com     a help page
 *
 * String rules rather than `new URL()`: the shop runs this on a phone at the
 * moment something has gone wrong, and React Native's `URL` has historically
 * thrown "not implemented" for `protocol`, `hostname` and `searchParams`.
 */

export const SUPPORT_LINK_SCHEMES = ["https:", "tel:", "mailto:"] as const;

function schemeOf(value: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(value);
  return match ? match[1]!.toLowerCase() : null;
}

function httpsHost(value: string): string | null {
  const match = /^https:\/\/([^/?#:]+)/i.exec(value);
  return match ? match[1]!.toLowerCase() : null;
}

/** The link, trimmed, when it is one support can be reached on; else null. */
export function normalizeSupportLink(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value || /\s/.test(value)) return null;

  const scheme = schemeOf(value);
  if (
    !scheme ||
    !(SUPPORT_LINK_SCHEMES as readonly string[]).includes(scheme)
  ) {
    return null;
  }
  if (scheme === "https:" && !httpsHost(value)) return null;
  // A scheme with nothing after it would open an empty dialler or mail draft.
  if (value.length <= scheme.length) return null;
  return value;
}

/**
 * Why a link is refused, in words an admin can act on — or null when it is
 * acceptable. Empty is acceptable: it means "no support link", and the shop
 * hides the button.
 */
export function describeSupportLinkProblem(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (normalizeSupportLink(value)) return null;

  if (/\s/.test(value)) {
    return "No spaces — for a phone number use tel:+2547XXXXXXXX.";
  }
  const scheme = schemeOf(value);
  if (scheme === "http:") return "Use https://, not http://.";
  if (!scheme) {
    return "Start with tel:, mailto:, or https:// (WhatsApp: https://wa.me/2547XXXXXXXX).";
  }
  return "Use a tel:, mailto:, or https:// link.";
}

/**
 * The link with the order attached where the channel allows it, so the first
 * thing support reads is which order this is about. WhatsApp and email carry a
 * prefilled message; a phone number or a help page is returned unchanged.
 */
export function supportLinkForOrder(
  raw: string | null | undefined,
  reference: string,
): string | null {
  const base = normalizeSupportLink(raw);
  if (!base) return null;

  const message = `Hi, I need help with order ${reference}.`;
  const joiner = base.includes("?") ? "&" : "?";

  if (schemeOf(base) === "mailto:") {
    return `${base}${joiner}subject=${encodeURIComponent(`Order ${reference}`)}&body=${encodeURIComponent(message)}`;
  }

  const host = httpsHost(base);
  if (host === "wa.me" || host === "api.whatsapp.com") {
    return `${base}${joiner}text=${encodeURIComponent(message)}`;
  }

  return base;
}
