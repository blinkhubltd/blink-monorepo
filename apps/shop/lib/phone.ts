/**
 * Splitting a stored phone number into a dialling code and the rest, and
 * putting it back together.
 *
 * Pure, and split out of `components/checkout/sections.tsx` for the same
 * reason `theme.ts` and `address-label.ts` are separate from the modules
 * that use them: that file is JSX and cannot be imported by a unit test,
 * and the round-trip property below is load-bearing.
 *
 * ── What the round trip has to guarantee ─────────────────────────────────
 *
 * `/edit-profile` seeds its form by splitting the saved number, then decides
 * whether anything changed by re-joining what is in the fields and comparing.
 * If `join(split(x))` were not `x` for a number already on file, the Save
 * button would light up the instant the screen loaded, with nothing edited —
 * and pressing it would write back a number subtly different from the one the
 * rider had been calling.
 */

/**
 * The dialling codes this app actually delivers against, plus the handful a
 * customer is likely to be reachable on from abroad.
 *
 * A list, not a full ISO table: the field's job is to keep the code out of the
 * number so `+254` is not retyped (and mistyped) on every order, and a 200-row
 * picker would be a worse version of typing it.
 */
export const DIAL_CODES = [
  { code: "+254", flag: "🇰🇪", name: "Kenya" },
  { code: "+256", flag: "🇺🇬", name: "Uganda" },
  { code: "+255", flag: "🇹🇿", name: "Tanzania" },
  { code: "+250", flag: "🇷🇼", name: "Rwanda" },
  { code: "+251", flag: "🇪🇹", name: "Ethiopia" },
  { code: "+211", flag: "🇸🇸", name: "South Sudan" },
  { code: "+252", flag: "🇸🇴", name: "Somalia" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+1", flag: "🇺🇸", name: "United States" },
] as const;

export const DEFAULT_DIAL_CODE = "+254";

/**
 * Split a stored number into a dialling code and the rest.
 *
 * Longest code first, so `+250` is not read as `+25` + `0`. A number with no
 * recognised prefix keeps the default code and is shown whole, rather than
 * being silently truncated into a number nobody can call.
 */
export function splitPhone(stored: string): { dial: string; national: string } {
  const cleaned = stored.replace(/[\s-]/g, "");
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((entry) => cleaned.startsWith(entry.code));
  // No code: a local number, most likely `07…` typed into the old single
  // field. Its trunk `0` is dropped so it reads as the national part.
  if (!match)
    return { dial: DEFAULT_DIAL_CODE, national: cleaned.replace(/^0+/, "") };
  return { dial: match.code, national: cleaned.slice(match.code.length) };
}

/**
 * The E.164 number the record stores: code and national part, no spaces.
 *
 * A national part that already carries a `+` is a complete international
 * number and is returned as-is. Two things arrive that way and both used to
 * come out as `+254+919876543210`, which `setMyPhone` then rejected:
 *
 *   - a stored number whose country code is not in `DIAL_CODES` (`splitPhone`
 *     deliberately keeps such a number whole rather than truncating it), so
 *     simply loading the edit form and pressing Save failed;
 *   - someone typing their full number, `+` and all, into the number field,
 *     which is an obvious thing to do and was silently unrecoverable.
 */
export function joinPhone(dial: string, national: string): string {
  const cleaned = national.replace(/[\s-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  return `${dial}${cleaned.replace(/^0+/, "")}`;
}

/**
 * `+254741773276` → `+254 741 773 276`, for reading only; the record keeps the
 * unspaced form. Only a 9-digit national part — the East African shape this
 * app mostly holds — is grouped; anything else is shown as stored rather than
 * split at the wrong places.
 */
export function formatPhone(stored: string): string {
  const { dial, national } = splitPhone(stored);
  const grouped = /^\d{9}$/.test(national)
    ? national.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")
    : national;
  return `${dial} ${grouped}`.trim();
}
