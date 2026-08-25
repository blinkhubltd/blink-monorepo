/**
 * Kenyan phone number handling.
 *
 * Pure and separate from the sign-in screen so the parsing is testable — this is
 * the field that decides whether a rider can get into the app at all.
 */

/** Local subscriber numbers are 9 digits after the +254 country code. */
export const LOCAL_DIGITS = 9;

/**
 * Normalises whatever a rider types into E.164.
 *
 * Accepts the three forms people actually enter — `712345678`, `0712345678`,
 * `254712345678` — plus any spacing, and returns null when it cannot be one of
 * them. Clerk requires E.164, so sending the raw input fails with an opaque
 * error at the API rather than a clear one in the field.
 */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;

  let local: string;
  if (digits.startsWith("254")) {
    local = digits.slice(3);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (local.length !== LOCAL_DIGITS) return null;
  // A Kenyan mobile subscriber number never starts with 0 once the trunk prefix
  // is stripped; "00712345678" would otherwise pass length but not be dialable.
  if (local.startsWith("0")) return null;
  return `+254${local}`;
}

/** "+254712345678" -> "+254 712 ••• 678", for the verify screen. */
export function maskE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < LOCAL_DIGITS) return phone;
  const local = digits.slice(-LOCAL_DIGITS);
  return `+254 ${local.slice(0, 3)} ••• ${local.slice(-3)}`;
}
