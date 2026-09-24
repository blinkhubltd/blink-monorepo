import { useCallback, useEffect, useRef, useState } from "react";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import {
  clerkErrorMessage,
  isCompleteCode,
  isUnknownAccount,
  normaliseCode,
} from "@repo/lib/auth";

import { isValidEmail, normaliseEmail } from "./credentials";

/**
 * The reset behind "Forgot password?".
 *
 * Clerk models this as a sign-in with a different first factor, not as a
 * separate resource: `signIn.create({ strategy: "reset_password_email_code" })`
 * mails a code. From there this takes three steps, one thing per screen:
 *
 *   email    — ask for the address and send the code.
 *   code     — checked the moment the sixth digit lands:
 *              `attemptFirstFactor` with the code alone moves the attempt to
 *              `needs_new_password`.
 *   password — `signIn.resetPassword` sets it and completes the sign-in.
 *
 * The shop's version asks for the code and the new password together, which
 * means a wrong code is only discovered after someone has also chosen a
 * password — and the number pad the code field opens hides the password
 * field and the button underneath it. Checking the code on its own step
 * fixes both.
 *
 * The one rule that matters most here is `fail`: an email with no account
 * still advances to "check your email" exactly as a real one would.
 * Answering differently would let this screen be used to find out which
 * addresses belong to riders — the same thing sign-in's error must not leak.
 * For such an address the code step simply never accepts a code.
 */

export type ResetStep = "email" | "code" | "password";

const RESEND_SECONDS = 30;
const MIN_PASSWORD = 8;

export function usePasswordReset(initialEmail: string, onDone: () => void) {
  const { isLoaded, signIn, setActive } = useSignIn();

  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  /** Autofill fires the change handler twice; one attempt per code. */
  const submittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const fail = useCallback((err: unknown, fallback: string) => {
    setBusy(false);
    if (isClerkAPIResponseError(err)) {
      // An unknown email is answered the same way whether or not the account
      // exists, on purpose — see this file's header.
      if (isUnknownAccount(err.errors)) {
        setError(null);
        return "sent" as const;
      }
      setError(clerkErrorMessage(err.errors, fallback));
      return "failed" as const;
    }
    setError(fallback);
    return "failed" as const;
  }, []);

  const toCodeStep = useCallback(() => {
    submittedFor.current = null;
    setCode("");
    setStep("code");
    setBusy(false);
    setResendIn(RESEND_SECONDS);
  }, []);

  const sendCode = useCallback(async () => {
    if (!isLoaded || !signIn) return;

    if (!email.trim()) {
      setFieldError("Enter your email address.");
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError("That email address does not look right.");
      return;
    }

    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normaliseEmail(email),
      });
      toCodeStep();
    } catch (err) {
      // An unknown address still advances, so nothing here distinguishes a
      // registered address from an unregistered one.
      if (fail(err, "Could not send a reset code. Try again.") === "sent") {
        toCodeStep();
      }
    }
  }, [isLoaded, signIn, email, fail, toCodeStep]);

  /** Runs on the sixth digit — the screen has no "Verify" button. */
  const submitCode = useCallback(
    async (raw: string) => {
      if (!signIn) return;
      const clean = normaliseCode(raw);
      if (!isCompleteCode(clean)) return;
      if (submittedFor.current === clean) return;
      submittedFor.current = clean;

      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const attempt = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code: clean,
        });

        if (attempt.status === "needs_new_password") {
          setBusy(false);
          setStep("password");
          return;
        }
        if (attempt.status === "complete") {
          await setActive!({ session: attempt.createdSessionId });
          setBusy(false);
          onDone();
          return;
        }
        setBusy(false);
        setError(
          `Resetting stopped at "${attempt.status}", which this screen does not handle yet.`,
        );
      } catch (err) {
        submittedFor.current = null;
        setCode("");
        fail(err, "That code did not work. Check it and try again.");
      }
    },
    [signIn, setActive, onDone, fail],
  );

  const submitPassword = useCallback(async () => {
    if (!signIn) return;
    if (password.length < MIN_PASSWORD) {
      setFieldError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const attempt = await signIn.resetPassword({ password });

      if (attempt.status === "complete") {
        await setActive!({ session: attempt.createdSessionId });
        setBusy(false);
        onDone();
        return;
      }

      // A second factor on an account that just reset its password is
      // possible; this screen does not carry the UI for it, and saying so
      // beats a silent stall.
      setBusy(false);
      setError(
        "Your password was reset. Sign in with it from the previous screen.",
      );
    } catch (err) {
      fail(err, "Could not set that password. Try another.");
    }
  }, [signIn, password, setActive, onDone, fail]);

  const resend = useCallback(async () => {
    if (resendIn > 0 || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normaliseEmail(email),
      });
    } catch (err) {
      if (fail(err, "Could not send another code just yet.") === "failed") {
        return;
      }
    }
    submittedFor.current = null;
    setCode("");
    setBusy(false);
    setNotice("We sent another code.");
    setResendIn(RESEND_SECONDS);
  }, [resendIn, signIn, email, fail]);

  return {
    isLoaded,
    step,
    email,
    setEmail: (next: string) => {
      setEmail(next);
      setFieldError(null);
    },
    code,
    setCode: (next: string) => {
      setCode(next);
      setError(null);
      if (next.length === 6) void submitCode(next);
    },
    password,
    setPassword: (next: string) => {
      setPassword(next);
      setFieldError(null);
    },
    busy,
    error,
    fieldError,
    notice,
    resendIn,
    sendCode,
    submitPassword,
    resend,
    /** Back one step: password → code → email. */
    back: () => {
      setError(null);
      setFieldError(null);
      setNotice(null);
      if (step === "password") {
        // The verified code is spent; a fresh one is needed to try again.
        setStep("code");
        submittedFor.current = null;
        setCode("");
      } else {
        setStep("email");
      }
    },
  };
}
