/**
 * The credential rules from the sign-in handoff, as pure functions.
 *
 * Separate from `use-password-auth.ts` for the same reason `lib/theme.ts` is
 * separate from `lib/theme-preference.ts`: that file imports Clerk and React,
 * neither of which loads under vitest, so logic worth testing cannot live
 * beside them. Everything here is a plain function over plain values.
 *
 * The rules themselves are the handoff's, verbatim:
 *
 *   Email: required, valid format, trimmed, lower-cased.
 *   Password: required, 8+ characters on sign up.
 *   Name: required on sign up.
 */

export type AuthMode = "signIn" | "signUp";

export interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

export const MIN_PASSWORD = 8;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(raw));
}

/**
 * Clerk wants first and last name; the design asks for one "Name" field.
 *
 * Split on the first run of whitespace. A single word is a first name with no
 * last name, which Clerk accepts — the alternative, refusing to submit until
 * someone types a surname, would be this app inventing a requirement the
 * design does not have.
 */
export function splitName(raw: string): { first: string; last: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { first: "", last: "" };
  const gap = trimmed.indexOf(" ");
  if (gap === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, gap), last: trimmed.slice(gap + 1) };
}

/**
 * Validate what the design says to validate, and nothing more.
 *
 * Note the length rule is sign-up only. Applying it to sign-in would lock out
 * every account created before the rule existed — the password is already
 * set, and this screen is not where it gets re-judged.
 */
export function validate(
  mode: AuthMode,
  values: { name: string; email: string; password: string },
): FieldErrors {
  const errors: FieldErrors = {};

  if (mode === "signUp" && !values.name.trim()) {
    errors.name = "Enter your name.";
  }

  if (!values.email.trim()) {
    errors.email = "Enter your email address.";
  } else if (!isValidEmail(values.email)) {
    errors.email = "That email address does not look right.";
  }

  if (!values.password) {
    errors.password = "Enter your password.";
  } else if (mode === "signUp" && values.password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }

  return errors;
}
