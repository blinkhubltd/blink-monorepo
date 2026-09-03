import { useCallback, useEffect, useRef, useState } from "react";
import {
  isClerkAPIResponseError,
  useSignIn,
  useSignUp,
} from "@clerk/clerk-expo";
import type {
  AttemptSecondFactorParams,
  SignInFirstFactor,
  SignInResource,
  SignInSecondFactor,
} from "@clerk/types";
import {
  clerkErrorMessage,
  describeSecondFactor,
  isCompleteCode,
  isUnknownAccount,
  normaliseCode,
  type FactorPrompt,
} from "@repo/lib/auth";

/**
 * Customer sign-in and sign-up, in one adaptive flow.
 *
 * ── Adaptive, because assuming a strategy is what breaks ─────────────────
 *
 * Ported from the admin app, which arrived here by fixing two bugs that only
 * surface when a Clerk instance is reconfigured — both the same mistake of
 * assuming rather than reading:
 *
 *   - defaulting a second factor to `"totp"` asked for an authenticator code on
 *     a passwordless instance;
 *   - reading `/v1/environment`'s `used_for_first_factor` as "password sign-in
 *     is on". It marks which attributes can be an IDENTIFIER, not which
 *     credentials are accepted, so it says `false` with passwords fully enabled.
 *
 * So nothing here hardcodes a factor. `signIn.create()` is called first and the
 * offered factors decide what the screen asks for.
 *
 * ── Three deliberate differences from the admin flow ─────────────────────
 *
 * 1. **An unknown email offers SIGN-UP, not access-denied.** The rider app
 *    routes `form_identifier_not_found` to a denial screen, which is right for
 *    a closed roster and absurd for a shop — that is a prospective customer.
 * 2. **No redirect anywhere.** The screen is presented as a modal over whatever
 *    route the customer was on, so it dismisses in place. `router.replace` to a
 *    post-login destination is what this app was built to avoid.
 * 3. **A double-submit latch**, taken from the rider app's verify screen: SMS
 *    and email autofill both fire the change handler twice, and the second
 *    attempt fails as a reused code.
 */

export type Step =
  "identifier" | "password" | "emailCode" | "secondFactor" | "signUpCode";

interface State {
  step: Step;
  email: string;
  password: string;
  code: string;
  /** Set once Clerk has told us what this account actually offers. */
  passwordOffered: boolean;
  emailCodeOffered: boolean;
  prompt: FactorPrompt | null;
  /** True when the identifier is not registered, so the screen offers sign-up. */
  unknownAccount: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  resendIn: number;
}

const RESEND_SECONDS = 30;

export function useSignInFlow(onDone: () => void) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signUp, setActive: setActiveSignUp } = useSignUp();

  const [state, setState] = useState<State>({
    step: "identifier",
    email: "",
    password: "",
    code: "",
    passwordOffered: false,
    emailCodeOffered: false,
    prompt: null,
    unknownAccount: false,
    busy: false,
    error: null,
    notice: null,
    resendIn: 0,
  });

  const patch = useCallback(
    (next: Partial<State>) => setState((s) => ({ ...s, ...next })),
    [],
  );

  // Autofill fires the change handler twice; without this the second attempt
  // reaches Clerk with a code the first one already consumed, and the customer
  // sees "incorrect code" for a code that was correct.
  const submittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (state.resendIn <= 0) return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, resendIn: Math.max(0, s.resendIn - 1) })),
      1000,
    );
    return () => clearTimeout(timer);
  }, [state.resendIn]);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (isClerkAPIResponseError(err)) {
        patch({
          busy: false,
          error: clerkErrorMessage(err.errors, fallback),
          unknownAccount: isUnknownAccount(err.errors),
        });
        return;
      }
      patch({ busy: false, error: fallback });
    },
    [patch],
  );

  const finish = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!sessionId) {
        // Better than calling setActive(undefined) and leaving the customer on
        // a screen that looks like it worked.
        patch({ busy: false, error: "Sign-in did not complete. Try again." });
        return;
      }
      await setActive!({ session: sessionId });
      patch({ busy: false });
      onDone();
    },
    [setActive, patch, onDone],
  );

  const sendEmailCode = useCallback(
    async (emailAddressId: string) => {
      await signIn!.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId,
      });
      submittedFor.current = null;
      patch({
        step: "emailCode",
        code: "",
        busy: false,
        error: null,
        resendIn: RESEND_SECONDS,
      });
    },
    [signIn, patch],
  );

  /** Handle whatever status Clerk came back with, including second factors. */
  const advance = useCallback(
    async (attempt: SignInResource) => {
      if (attempt.status === "complete") {
        await finish(attempt.createdSessionId);
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const offered = attempt.supportedSecondFactors as
          SignInSecondFactor[] | null | undefined;
        const first = offered?.[0];
        if (!first) {
          patch({
            busy: false,
            error:
              "This account needs a second step, but we could not tell which. Contact support.",
          });
          return;
        }

        // Prepared BEFORE the screen renders, so the code is already on its way
        // when the customer sees the prompt.
        if (first.strategy === "phone_code") {
          await signIn!.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: first.phoneNumberId,
          });
        } else if (first.strategy === "email_code") {
          await signIn!.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: first.emailAddressId,
          });
        }

        const prompt = describeSecondFactor(first.strategy);
        submittedFor.current = null;
        patch({
          step: "secondFactor",
          prompt,
          code: "",
          busy: false,
          error: null,
          resendIn: prompt.resendable ? RESEND_SECONDS : 0,
        });
        return;
      }

      patch({
        busy: false,
        error: `Sign-in stopped at "${attempt.status}", which this screen does not handle yet.`,
      });
    },
    [finish, signIn, patch],
  );

  /** Step 1: hand Clerk the email and let it say what this account supports. */
  const submitIdentifier = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    const email = state.email.trim();
    if (!email) {
      patch({ error: "Enter your email address." });
      return;
    }

    patch({ busy: true, error: null, notice: null, unknownAccount: false });
    try {
      const attempt = await signIn.create({ identifier: email });

      if (attempt.status !== "needs_first_factor") {
        await advance(attempt);
        return;
      }

      const factors = (attempt.supportedFirstFactors ??
        []) as SignInFirstFactor[];
      const hasPassword = factors.some((f) => f.strategy === "password");
      const emailFactor = factors.find((f) => f.strategy === "email_code") as
        Extract<SignInFirstFactor, { strategy: "email_code" }> | undefined;

      patch({ passwordOffered: hasPassword, emailCodeOffered: !!emailFactor });

      // An emailed code is the customer default, so prefer it when offered even
      // if the instance also allows passwords — one less thing to remember.
      if (emailFactor) {
        await sendEmailCode(emailFactor.emailAddressId);
        return;
      }
      if (hasPassword) {
        patch({ step: "password", busy: false });
        return;
      }

      patch({
        busy: false,
        error: `This account has no sign-in method this screen supports. Offered: ${
          factors.map((f) => f.strategy).join(", ") || "none"
        }.`,
      });
    } catch (err) {
      fail(
        err,
        "Could not start sign-in. Check your connection and try again.",
      );
    }
  }, [isLoaded, signIn, state.email, patch, advance, sendEmailCode, fail]);

  const submitPassword = useCallback(async () => {
    if (!signIn) return;
    patch({ busy: true, error: null });
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "password",
        password: state.password,
      });
      await advance(attempt);
    } catch (err) {
      fail(err, "That password did not work.");
    }
  }, [signIn, state.password, patch, advance, fail]);

  const submitCode = useCallback(
    async (raw?: string) => {
      if (!signIn) return;
      const code = normaliseCode(raw ?? state.code);
      if (!isCompleteCode(code)) return;
      // The latch: autofill delivers the same value twice.
      if (submittedFor.current === code) return;
      submittedFor.current = code;

      patch({ busy: true, error: null });
      try {
        const attempt =
          state.step === "secondFactor" && state.prompt
            ? await signIn.attemptSecondFactor({
                // Passed THROUGH, not cast. Casting every strategy to "totp"
                // satisfied the compiler while sending Clerk the wrong name.
                strategy: state.prompt.strategy,
                code,
              } as AttemptSecondFactorParams)
            : await signIn.attemptFirstFactor({ strategy: "email_code", code });
        await advance(attempt);
      } catch (err) {
        // Allow a retry with the same digits after a genuine failure.
        submittedFor.current = null;
        fail(err, "That code did not work. Check it and try again.");
      }
    },
    [signIn, state.code, state.step, state.prompt, patch, advance, fail],
  );

  const resend = useCallback(async () => {
    if (!signIn || state.resendIn > 0) return;
    patch({ busy: true, error: null });
    try {
      if (state.step === "secondFactor" && state.prompt) {
        const offered = signIn.supportedSecondFactors as
          SignInSecondFactor[] | null | undefined;
        const factor = offered?.find(
          (f) => f.strategy === state.prompt!.strategy,
        );
        if (factor?.strategy === "email_code") {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: factor.emailAddressId,
          });
        } else if (factor?.strategy === "phone_code") {
          await signIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: factor.phoneNumberId,
          });
        }
        submittedFor.current = null;
        patch({ busy: false, code: "", resendIn: RESEND_SECONDS });
        return;
      }

      const factor = (signIn.supportedFirstFactors ?? []).find(
        (f) => f.strategy === "email_code",
      ) as Extract<SignInFirstFactor, { strategy: "email_code" }> | undefined;
      if (!factor) {
        patch({ busy: false, error: "Could not resend the code." });
        return;
      }
      await sendEmailCode(factor.emailAddressId);
    } catch (err) {
      fail(err, "Could not resend the code.");
    }
  }, [
    signIn,
    state.resendIn,
    state.step,
    state.prompt,
    patch,
    sendEmailCode,
    fail,
  ]);

  /**
   * Sign-up, offered when the email is not registered.
   *
   * Deliberately minimal: an email and a code. The old app also collected first
   * and last name at this point, which is friction in front of a purchase — the
   * profile screen can ask later, once the customer has a reason to care.
   */
  const startSignUp = useCallback(async () => {
    if (!signUp) return;
    patch({ busy: true, error: null });
    try {
      await signUp.create({ emailAddress: state.email.trim() });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      submittedFor.current = null;
      patch({
        step: "signUpCode",
        code: "",
        busy: false,
        unknownAccount: false,
        resendIn: RESEND_SECONDS,
      });
    } catch (err) {
      fail(err, "Could not create the account.");
    }
  }, [signUp, state.email, patch, fail]);

  const submitSignUpCode = useCallback(
    async (raw?: string) => {
      if (!signUp) return;
      const code = normaliseCode(raw ?? state.code);
      if (!isCompleteCode(code)) return;
      if (submittedFor.current === code) return;
      submittedFor.current = code;

      patch({ busy: true, error: null });
      try {
        const attempt = await signUp.attemptEmailAddressVerification({ code });
        if (attempt.status !== "complete") {
          patch({
            busy: false,
            error: `Sign-up stopped at "${attempt.status}".`,
          });
          return;
        }
        await setActiveSignUp!({ session: attempt.createdSessionId });
        patch({ busy: false });
        onDone();
      } catch (err) {
        submittedFor.current = null;
        fail(err, "That code did not work. Check it and try again.");
      }
    },
    [signUp, state.code, patch, setActiveSignUp, onDone, fail],
  );

  const restart = useCallback(() => {
    submittedFor.current = null;
    patch({
      step: "identifier",
      password: "",
      code: "",
      prompt: null,
      unknownAccount: false,
      error: null,
      notice: null,
      busy: false,
      resendIn: 0,
    });
  }, [patch]);

  return {
    ...state,
    isLoaded,
    setEmail: (email: string) => patch({ email, error: null }),
    setPassword: (password: string) => patch({ password, error: null }),
    setCode: (code: string) => patch({ code, error: null }),
    submitIdentifier,
    submitPassword,
    submitCode,
    submitSignUpCode,
    startSignUp,
    resend,
    restart,
  };
}
