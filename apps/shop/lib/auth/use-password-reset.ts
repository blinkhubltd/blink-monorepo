import { useCallback, useEffect, useRef, useState } from "react";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import {
  clerkErrorMessage,
  isCompleteCode,
  isUnknownAccount,
  normaliseCode,
} from "@repo/lib/auth";

import { isValidEmail, normaliseEmail } from "./use-password-auth";

/**
 * The reset behind "Forgot password?".
 *
 * Clerk models this as a sign-in with a different first factor, not as a
 * separate resource: `signIn.create({ strategy: "reset_password_email_code" })`
 * mails a code, and `attemptFirstFactor` with that code AND the new password
 * both verifies the code and sets the password in one call. Getting that
 * shape wrong — expecting a separate "set password" step — is the usual way
 * this flow is built twice.
 *
 * Two steps, matching what the customer experiences: ask for the email, then
 * ask for the code and the new password together.
 */

export type ResetStep = "email" | "reset";

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
      // exists, on purpose: telling an anonymous caller which addresses are
      // registered turns this screen into an account-enumeration oracle.
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
      submittedFor.current = null;
      setStep("reset");
      setBusy(false);
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      // See `fail`: an unknown address still advances, so nothing here
      // distinguishes a registered address from an unregistered one.
      if (fail(err, "Could not send a reset code. Try again.") === "sent") {
        setStep("reset");
        setBusy(false);
        setResendIn(RESEND_SECONDS);
      }
    }
  }, [isLoaded, signIn, email, fail]);

  const submitReset = useCallback(async () => {
    if (!signIn) return;

    const clean = normaliseCode(code);
    if (!isCompleteCode(clean)) {
      setError("Enter the 6-digit code we emailed you.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setFieldError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (submittedFor.current === `${clean}:${password}`) return;
    submittedFor.current = `${clean}:${password}`;

    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      // One call: the code is checked and the password is set together.
      const attempt = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: clean,
        password,
      });

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
        `Your password was reset, but signing in needs another step ("${attempt.status}"). Sign in from the previous screen.`,
      );
    } catch (err) {
      submittedFor.current = null;
      fail(err, "That code did not work. Check it and try again.");
    }
  }, [signIn, code, password, setActive, onDone, fail]);

  const resend = useCallback(async () => {
    if (resendIn > 0 || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normaliseEmail(email),
      });
      submittedFor.current = null;
      setCode("");
      setBusy(false);
      setNotice("We sent another code.");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      fail(err, "Could not send another code just yet.");
    }
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
    submitReset,
    resend,
  };
}
