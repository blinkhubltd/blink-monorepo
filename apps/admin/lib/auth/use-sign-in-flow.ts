"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

/**
 * The sign-in flow, hand-rolled on Clerk's hooks.
 *
 * ── Why not `<SignIn />` ──────────────────────────────────────────────────
 *
 * The prebuilt component was styled with `appearance.elements` overrides
 * carrying hardcoded `bg-blue-600` — which is not a Blink colour, ignores the
 * theme, and cannot follow dark mode. Past a certain amount of override it is
 * less code to own the form.
 *
 * ── Why this differs from sydia's version ────────────────────────────────
 *
 * Sydia is on `@clerk/nextjs` 7 and uses the newer surface: `signIn.create()`
 * returning `{ error }`, `signIn.finalize()`, and `signIn.mfa.sendEmailCode()`.
 * None of those exist in 6.39.6, which is what this app is on. Here `create()`
 * throws on failure, activation goes through `setActive({ session })`, and the
 * second factor uses `prepareSecondFactor` / `attemptSecondFactor`.
 *
 * Also: email code is not a second-factor strategy in Clerk. The real ones are
 * TOTP, SMS and backup codes, so the verify step reads the strategy off the
 * response rather than assuming.
 *
 * ── Errors ────────────────────────────────────────────────────────────────
 *
 * Clerk's messages are shown as-is where they are useful ("Password is
 * incorrect") because rewriting them into a generic "sign-in failed" is what
 * makes a login screen infuriating. The one message deliberately NOT passed
 * through is an unknown identifier: Clerk distinguishes "no such account" from
 * "wrong password", and surfacing that difference lets anyone test whether an
 * email has an account here.
 */

type Step = "credentials" | "secondFactor" | "resetRequest" | "resetVerify";

interface SecondFactor {
  strategy: string;
  label: string;
  helper: string;
}

/** Describe a second factor in words the user recognises. */
function describeSecondFactor(strategy: string): SecondFactor {
  switch (strategy) {
    case "phone_code":
      return {
        strategy,
        label: "Enter the code we sent by SMS",
        helper: "Check your phone for a 6-digit code.",
      };
    case "backup_code":
      return {
        strategy,
        label: "Enter a backup code",
        helper: "Use one of the recovery codes you saved.",
      };
    case "totp":
    default:
      return {
        strategy: "totp",
        label: "Enter your authenticator code",
        helper: "Open your authenticator app for the current 6-digit code.",
      };
  }
}

function messageFor(err: unknown, fallback: string): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    if (!first) return fallback;
    // Do not confirm whether an account exists. Everything else is more helpful
    // said plainly than hidden.
    if (
      first.code === "form_identifier_not_found" ||
      first.code === "form_password_incorrect"
    ) {
      return "That email and password combination is not recognised.";
    }
    return first.longMessage ?? first.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export function useSignInFlow(redirectTo: string = "/") {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [secondFactor, setSecondFactor] = useState<SecondFactor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finish = useCallback(
    async (sessionId: string | null) => {
      if (!sessionId) {
        setError("Sign-in completed but no session was created. Try again.");
        return;
      }
      await setActive?.({ session: sessionId });
      // `replace`, not `push` — the sign-in page should not sit in history for
      // the back button to land on after a successful sign-in.
      router.replace(redirectTo);
    },
    [setActive, router, redirectTo],
  );

  const submitCredentials = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        const attempt = await signIn.create({
          identifier: email.trim(),
          password,
        });

        if (attempt.status === "complete") {
          await finish(attempt.createdSessionId);
          return;
        }

        if (attempt.status === "needs_second_factor") {
          // Read the offered strategy rather than assuming TOTP; an account on
          // SMS would otherwise be shown the wrong instructions and no code.
          const offered =
            attempt.supportedSecondFactors?.[0]?.strategy ?? "totp";
          const described = describeSecondFactor(offered);
          setSecondFactor(described);

          // TOTP and backup codes need no preparation — the code already exists
          // on the user's device. SMS has to be sent.
          if (described.strategy === "phone_code") {
            const factor = attempt.supportedSecondFactors?.find(
              (f) => f.strategy === "phone_code",
            );
            await signIn.prepareSecondFactor({
              strategy: "phone_code",
              phoneNumberId:
                factor && "phoneNumberId" in factor
                  ? factor.phoneNumberId
                  : "",
            });
          }

          setStep("secondFactor");
          return;
        }

        setError(
          `Sign-in needs a step this screen does not handle yet (${attempt.status}). ` +
            "Contact an administrator.",
        );
      } catch (err) {
        setError(messageFor(err, "Could not sign in. Try again."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, email, password, finish],
  );

  const submitSecondFactor = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn || !secondFactor) return;

      setLoading(true);
      setError(null);

      try {
        const attempt = await signIn.attemptSecondFactor({
          strategy: secondFactor.strategy as "totp",
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
    [isLoaded, signIn, secondFactor, code, finish],
  );

  /** Send a password-reset code to the address in the email field. */
  const requestReset = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLoaded || !signIn) return;

      setLoading(true);
      setError(null);
      setNotice(null);

      try {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: email.trim(),
        });
        setStep("resetVerify");
        setNotice(`We sent a code to ${email.trim()}.`);
      } catch (err) {
        setError(messageFor(err, "Could not send a reset code."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, email],
  );

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

        if (attempt.status === "complete") {
          await finish(attempt.createdSessionId);
          return;
        }
        if (attempt.status === "needs_second_factor") {
          const offered =
            attempt.supportedSecondFactors?.[0]?.strategy ?? "totp";
          setSecondFactor(describeSecondFactor(offered));
          setStep("secondFactor");
          setCode("");
          return;
        }
        setError("The password was not reset. Try again.");
      } catch (err) {
        setError(messageFor(err, "Could not reset your password."));
      } finally {
        setLoading(false);
      }
    },
    [isLoaded, signIn, code, newPassword, finish],
  );

  const goTo = useCallback((next: Step) => {
    setStep(next);
    setCode("");
    setNewPassword("");
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
    secondFactor,
    error,
    notice,
    loading,
    submitCredentials,
    submitSecondFactor,
    requestReset,
    submitReset,
    goTo,
  };
}
