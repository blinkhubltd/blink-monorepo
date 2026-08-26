"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { SignInFirstFactor, SignInSecondFactor } from "@clerk/types";

/**
 * The sign-in flow, driven by what the Clerk instance actually offers.
 *
 * ── The bug this replaces ─────────────────────────────────────────────────
 *
 * The first version asked for an email and a password, then treated whatever
 * came back as a second factor, defaulting to TOTP:
 *
 *     const offered = attempt.supportedSecondFactors?.[0]?.strategy ?? "totp";
 *
 * At the time the instance was passwordless — email code as the FIRST factor, no
 * second factor at all. So the password field had nothing to authenticate
 * against, and that `?? "totp"` asked for an authenticator code nobody had set
 * up. A guessed factor is worse than a failure: it looks like the account is
 * broken rather than like the app is wrong.
 *
 * ── Read the offer, do not read the environment ──────────────────────────
 *
 * The authority on what a sign-in accepts is `supportedFirstFactors` on the
 * attempt returned by `create({ identifier })`. It is NOT the `/v1/environment`
 * endpoint: that reports `password.used_for_first_factor: false` even with
 * password sign-in fully enabled, because the flag marks which attributes can
 * serve as an IDENTIFIER — email, phone, username — rather than which
 * credentials are accepted. Reading it as "no password sign-in" sends every user
 * down the email-code path.
 *
 * So nothing here hardcodes the factor order, and the same code works whether
 * the instance is passwordless, password-only, or both. That is not
 * hypothetical: this instance was passwordless and then had passwords turned on,
 * with no change to this file.
 *
 * ── The shape of the flow ────────────────────────────────────────────────
 *
 *   identifier ─┬─> (password submitted with the email) ─┐
 *               ├─> password step                        ├─> (second factor,
 *               └─> emailCode step                       ┘   only if required)
 *
 * The first screen collects email and password together, so a password instance
 * is one screen and one submit. Whether the password is used at all is still
 * decided by the offer, not by the form.
 *
 * "Forgot password?" appears only where a password is genuinely on offer —
 * resetting one the user does not have is a dead end.
 */

type Step =
  | "identifier"
  | "password"
  | "emailCode"
  | "secondFactor"
  | "resetVerify";

interface FactorPrompt {
  strategy: string;
  title: string;
  helper: string;
  /** Six-box OTP, versus a plain text input for backup codes. */
  otp: boolean;
}

function describeSecondFactor(strategy: string): FactorPrompt {
  switch (strategy) {
    case "phone_code":
      return {
        strategy,
        title: "Check your phone",
        helper: "Enter the 6-digit code we sent by SMS.",
        otp: true,
      };
    case "backup_code":
      return {
        strategy,
        title: "Enter a backup code",
        helper: "Use one of the recovery codes you saved.",
        otp: false,
      };
    case "totp":
      return {
        strategy,
        title: "Authenticator code",
        helper: "Open your authenticator app for the current 6-digit code.",
        otp: true,
      };
    default:
      // Named rather than guessed. An unrecognised strategy is a configuration
      // this screen has not been built for, and saying which one is what makes
      // it fixable.
      return {
        strategy,
        title: "Additional verification needed",
        helper: `This account requires "${strategy}", which this screen does not support yet.`,
        otp: false,
      };
  }
}

function messageFor(err: unknown, fallback: string): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    if (!first) return fallback;
    // Do not confirm whether an account exists — otherwise anyone can test
    // whether an email is registered here. Everything else reads better said
    // plainly than hidden behind a generic failure.
    if (
      first.code === "form_identifier_not_found" ||
      first.code === "form_password_incorrect"
    ) {
      return "That did not match an account. Check the address and try again.";
    }
    return first.longMessage ?? first.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

/** The email-code first factor, if this instance offers one. */
function findEmailCodeFactor(
  factors: SignInFirstFactor[] | undefined,
): Extract<SignInFirstFactor, { strategy: "email_code" }> | null {
  const match = (factors ?? []).find((f) => f.strategy === "email_code");
  return (match as Extract<SignInFirstFactor, { strategy: "email_code" }>) ?? null;
}

export function useSignInFlow(redirectTo: string = "/") {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("identifier");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [prompt, setPrompt] = useState<FactorPrompt | null>(null);
  /** Whether this instance accepts a password, learned from `create()`. */
  const [passwordOffered, setPasswordOffered] = useState(false);
  /** Whether an emailed code is available as an alternative. */
  const [emailCodeOffered, setEmailCodeOffered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finish = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!sessionId) {
        setError("Signed in, but no session was created. Try again.");
        return;
      }
      await setActive?.({ session: sessionId });
      // `replace`, so the back button does not land on the sign-in page after a
      // successful sign-in.
      router.replace(redirectTo);
    },
    [setActive, router, redirectTo],
  );

  /**
   * Prepare and move to the email-code step.
   *
   * Shared by the initial submit, the "use a code instead" switch and the
   * resend, so the prompt wording and the cleared code field cannot drift
   * between the three.
   */
  const sendEmailCode = useCallback(
    async (emailAddressId: string) => {
      if (!signIn) return;
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId,
      });
      setPrompt({
        strategy: "email_code",
        title: "Check your email",
        helper: `We sent a 6-digit code to ${email.trim()}.`,
        otp: true,
      });
      setCode("");
      setStep("emailCode");
    },
    [signIn, email],
  );

  /**
   * Route to whichever step the attempt now calls for.
   *
   * Shared by every submit handler, so the decision about what comes next exists
   * once. The previous version made it separately in each handler, which is how
   * the second-factor branch came to have a TOTP default the first-factor branch
   * did not.
   */
  const advance = useCallback(
    async (attempt: Awaited<ReturnType<NonNullable<typeof signIn>["create"]>>) => {
      if (attempt.status === "complete") {
        await finish(attempt.createdSessionId);
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const offered = attempt.supportedSecondFactors as
          | SignInSecondFactor[]
          | null
          | undefined;
        const first = offered?.[0];

        if (!first) {
          setError(
            "This account needs a second factor, but Clerk did not say which. " +
              "Check the instance configuration.",
          );
          return;
        }

        const described = describeSecondFactor(first.strategy);
        setPrompt(described);
        setCode("");

        // TOTP and backup codes already exist on the user's device; only SMS
        // has to be sent.
        if (first.strategy === "phone_code" && signIn) {
          await signIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: first.phoneNumberId,
          });
        }

        setStep("secondFactor");
        return;
      }

      setError(
        `Sign-in stopped at "${attempt.status}", which this screen does not ` +
          "handle. Contact an administrator.",
      );
    },
    [finish, signIn],
  );

  /**
   * Step one: email, and a password if the instance takes one.
   *
   * `create({ identifier })` with no strategy asks Clerk what this identifier can
   * be verified with, and `supportedFirstFactors` is the ONLY reliable answer.
   * The environment endpoint is not: it reports `password.used_for_first_factor:
   * false` even with password sign-in enabled, because that flag marks which
   * attributes can serve as an IDENTIFIER (email, phone, username) rather than
   * which credentials are accepted. Reading it as "no password sign-in" would
   * send every user down the email-code path.
   *
   * So the form shows both fields, and this decides what to do with them:
   *
   *   password offered + password typed  -> use it, one screen, one submit
   *   password offered + nothing typed   -> stop on the password step
   *   password not offered               -> send an email code, and say so if a
   *                                         password was typed for nothing
   */
  const submitIdentifier = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        const attempt = await signIn.create({ identifier: email.trim() });

        // Some configurations complete on the identifier alone.
        if (attempt.status !== "needs_first_factor") {
          await advance(attempt);
          return;
        }

        const factors = attempt.supportedFirstFactors ?? [];
        const hasPassword = factors.some((f) => f.strategy === "password");
        const emailFactor = findEmailCodeFactor(factors);
        setPasswordOffered(hasPassword);
        setEmailCodeOffered(emailFactor !== null);

        if (hasPassword && password.length > 0) {
          const withPassword = await signIn.attemptFirstFactor({
            strategy: "password",
            password,
          });
          await advance(withPassword);
          return;
        }

        if (hasPassword) {
          setStep("password");
          return;
        }

        if (emailFactor) {
          await sendEmailCode(emailFactor.emailAddressId);
          if (password.length > 0) {
            // Explain rather than silently discarding what they typed.
            setNotice(
              `This account signs in with an emailed code, not a password. ` +
                `We sent one to ${email.trim()}.`,
            );
          }
          return;
        }

        setError(
          "This account has no sign-in method this screen supports. Offered: " +
            (factors.map((f) => f.strategy).join(", ") || "none") +
            ".",
        );
      } catch (err) {
        setError(messageFor(err, "Could not sign in. Try again."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, email, password, advance, sendEmailCode],
  );

  /** Switch to the email code when both are on offer. */
  const useEmailCodeInstead = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);
    try {
      const emailFactor = findEmailCodeFactor(
        signIn.supportedFirstFactors ?? undefined,
      );
      if (!emailFactor) {
        setError("This account cannot sign in with an emailed code.");
        return;
      }
      await sendEmailCode(emailFactor.emailAddressId);
    } catch (err) {
      setError(messageFor(err, "Could not send a code."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, sendEmailCode]);

  const submitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);

      try {
        const attempt = await signIn.attemptFirstFactor({
          strategy: "password",
          password,
        });
        await advance(attempt);
      } catch (err) {
        setError(messageFor(err, "Could not sign in. Try again."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, password, advance],
  );

  const submitEmailCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);

      try {
        const attempt = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        });
        await advance(attempt);
      } catch (err) {
        setError(messageFor(err, "That code was not accepted."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, code, advance],
  );

  /** Send the email code again, for when it does not arrive. */
  const resendEmailCode = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);
    try {
      const emailFactor = findEmailCodeFactor(
        signIn.supportedFirstFactors ?? undefined,
      );
      if (!emailFactor) {
        setError("Could not resend — start again from your email address.");
        return;
      }
      await sendEmailCode(emailFactor.emailAddressId);
      setNotice("Sent again. Codes can take a moment to arrive.");
    } catch (err) {
      setError(messageFor(err, "Could not resend the code."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, sendEmailCode]);

  const submitSecondFactor = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn || !prompt) return;

      setLoading(true);
      setError(null);

      try {
        const attempt = await signIn.attemptSecondFactor({
          strategy: prompt.strategy as "totp",
          code: code.trim(),
        });
        if (attempt.status === "complete") {
          await finish(attempt.createdSessionId);
          return;
        }
        setError("That code was not accepted. Try again.");
      } catch (err) {
        setError(messageFor(err, "Could not verify that code."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, prompt, code, finish],
  );

  /**
   * Password reset. Only reachable when the instance offers a password, since
   * resetting one the user does not have is a dead end.
   */
  const requestReset = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setCode("");
      setNewPassword("");
      setStep("resetVerify");
      setNotice(`We sent a reset code to ${email.trim()}.`);
    } catch (err) {
      setError(messageFor(err, "Could not send a reset code."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, email]);

  const submitReset = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);

      try {
        const attempt = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code: code.trim(),
          password: newPassword,
        });
        await advance(attempt);
      } catch (err) {
        setError(messageFor(err, "Could not reset your password."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, code, newPassword, advance],
  );

  /** Back to the start, clearing anything half-entered. */
  const restart = useCallback(() => {
    setStep("identifier");
    setPassword("");
    setCode("");
    setNewPassword("");
    setPrompt(null);
    setError(null);
    setNotice(null);
  }, []);

  return {
    ready: isLoaded,
    step,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    newPassword,
    setNewPassword,
    prompt,
    passwordOffered,
    emailCodeOffered,
    error,
    notice,
    loading,
    submitIdentifier,
    useEmailCodeInstead,
    submitPassword,
    submitEmailCode,
    submitSecondFactor,
    resendEmailCode,
    requestReset,
    submitReset,
    restart,
  };
}
