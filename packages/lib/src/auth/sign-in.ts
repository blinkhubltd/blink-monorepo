/**
 * Clerk sign-in policy, framework-free.
 *
 * ── Why this is shared rather than copied ────────────────────────────────
 *
 * The admin app arrived at this logic by fixing two bugs that only appear when
 * a Clerk instance is reconfigured, and both were the same mistake — assuming a
 * strategy instead of reading what Clerk offered:
 *
 *   1. `supportedSecondFactors?.[0]?.strategy ?? "totp"` asked for an
 *      authenticator code on a passwordless instance, where nobody had one.
 *   2. Reading `/v1/environment`'s `password.used_for_first_factor` as "is
 *      password sign-in enabled". It reports `false` with password sign-in
 *      fully on, because that flag marks which attributes can serve as an
 *      IDENTIFIER, not which credentials are accepted.
 *
 * A second copy in the shop app would relearn both. So the parts that carry the
 * knowledge — which second factors exist, and how to describe them — live here,
 * and each app supplies its own Clerk SDK bindings around them.
 *
 * Nothing here imports Clerk. The error helper takes the already-extracted
 * error array rather than the error object, so `@clerk/nextjs` and
 * `@clerk/clerk-expo` can each narrow with their own
 * `isClerkAPIResponseError` and hand the result in.
 */

export interface FactorPrompt {
  strategy: string;
  title: string;
  helper: string;
  /** Render six OTP boxes rather than a plain text field. */
  otp: boolean;
  /** Offer a resend button. False for codes the server did not send. */
  resendable: boolean;
}

/**
 * How to present a second factor.
 *
 * `otp` and `resendable` are separate because they answer different questions.
 * A backup code is not six digits, so OTP boxes would truncate it. A TOTP code
 * is generated on the user's own device, so a "resend" button would be a lie.
 */
export function describeSecondFactor(strategy: string): FactorPrompt {
  switch (strategy) {
    case "email_code":
      // Clerk supports an emailed code as MFA — `PrepareSecondFactorParams`
      // includes `EmailCodeSecondFactorConfig`. Omitting this case is what
      // produced "requires email_code, which this screen does not support yet"
      // on an account whose second factor was exactly that.
      return {
        strategy,
        title: "Check your email",
        helper: "Enter the 6-digit code we just sent you.",
        otp: true,
        resendable: true,
      };
    case "phone_code":
      return {
        strategy,
        title: "Check your phone",
        helper: "Enter the 6-digit code we sent by SMS.",
        otp: true,
        resendable: true,
      };
    case "backup_code":
      return {
        strategy,
        title: "Enter a backup code",
        helper: "Use one of the recovery codes you saved.",
        otp: false,
        resendable: false,
      };
    case "totp":
      return {
        strategy,
        title: "Authenticator code",
        helper: "Open your authenticator app for the current 6-digit code.",
        otp: true,
        resendable: false,
      };
    default:
      // Named rather than guessed. An unrecognised strategy is a configuration
      // the screen has not been built for, and saying which one is what makes
      // it fixable instead of mysterious.
      return {
        strategy,
        title: "Additional verification needed",
        helper: `This account requires "${strategy}", which this screen does not support yet.`,
        otp: false,
        resendable: false,
      };
  }
}

/** The shape of a Clerk API error entry, without importing Clerk. */
export interface ClerkErrorLike {
  code?: string;
  message?: string;
  longMessage?: string;
}

/**
 * Codes that must not be echoed to the user.
 *
 * Both confirm whether an address is registered, so distinct messages let
 * anyone probe for accounts. They share one deliberately vague reply.
 */
const ENUMERATION_CODES = new Set([
  "form_identifier_not_found",
  "form_password_incorrect",
]);

/**
 * A message for a failed sign-in attempt.
 *
 * Clerk's own copy is usually better than anything generic, so it is preferred —
 * except where repeating it would leak whether an account exists.
 */
export function clerkErrorMessage(
  errors: ClerkErrorLike[] | undefined,
  fallback: string,
): string {
  const first = errors?.[0];
  if (!first) return fallback;
  if (first.code && ENUMERATION_CODES.has(first.code)) {
    return "That did not match an account. Check the address and try again.";
  }
  return first.longMessage ?? first.message ?? fallback;
}

/**
 * Whether a failure means "no such account".
 *
 * The two apps answer this differently on purpose, which is why it is exposed
 * as a predicate rather than baked into a redirect. The rider app has a closed
 * roster, so an unknown identifier is genuinely access-denied. A shop must
 * offer sign-up instead — sending a prospective customer to an "access denied"
 * screen would be absurd.
 */
export function isUnknownAccount(errors: ClerkErrorLike[] | undefined): boolean {
  return errors?.[0]?.code === "form_identifier_not_found";
}

/**
 * Normalise a typed verification code.
 *
 * Autofill and paste both deliver spaces and non-breaking spaces, and a code
 * with a stray space fails verification with a message that blames the user.
 */
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s ]/g, "");
}

/** Six digits, which is what every Clerk OTP strategy issues. */
export function isCompleteCode(raw: string, length = 6): boolean {
  const cleaned = normaliseCode(raw);
  return cleaned.length === length && /^\d+$/.test(cleaned);
}
