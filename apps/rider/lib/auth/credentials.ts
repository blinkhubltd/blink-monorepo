/**
 * Email/password validation for rider sign-in, as pure functions.
 *
 * Separate from the screen for the same reason `lib/phone.ts` was: this is the
 * field that decides whether a rider can get into the app at all, and pure
 * functions are what stays testable without pulling in Clerk or React Native.
 *
 * There is no sign-up mode here on purpose. Riders are invited by their hub
 * lead from the admin dashboard, never self-registered — see
 * `isUnknownAccount` in `@repo/lib/auth` for why an unrecognised email is
 * treated as access-denied rather than "create an account instead".
 */

export interface FieldErrors {
  email?: string;
  password?: string;
}

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(raw));
}

export function validate(values: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.email.trim()) {
    errors.email = "Enter your email address.";
  } else if (!isValidEmail(values.email)) {
    errors.email = "That email address does not look right.";
  }

  if (!values.password) {
    errors.password = "Enter your password.";
  }

  return errors;
}
