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
  SignUpResource,
} from "@clerk/types";
import {
  clerkErrorMessage,
  describeSecondFactor,
  isCompleteCode,
  isUnknownAccount,
  normaliseCode,
  type FactorPrompt,
} from "@repo/lib/auth";

import {
  normaliseEmail,
  splitName,
  validate,
  type AuthMode,
  type FieldErrors,
} from "./credentials";
import { setRememberSession } from "./remember-session";

/**
 * Customer sign-in and sign-up, in the shape the sign-in handoff specifies:
 * one form, email and password together, name as well when registering.
 *
 * ── What this replaces, and what it keeps ────────────────────────────────
 *
 * `use-sign-in-flow.ts` asked for an email first and let Clerk's offered
 * factors decide what to ask for next. That was right for the screen it was
 * built for and is wrong for this one — the design puts both fields on screen
 * at once, so there is no "next" to decide.
 *
 * Three hard-won properties from that file are kept, because each one is a bug
 * that was already paid for once:
 *
 *  1. **No factor is assumed.** Passing `password` to `signIn.create` is a
 *     request, not a guarantee: on a passwordless instance Clerk answers
 *     `needs_first_factor` instead of failing, and this reads the offered
 *     factors and falls through to an emailed code rather than insisting.
 *  2. **A second factor's strategy is passed THROUGH, never cast to "totp".**
 *     Casting satisfied the compiler while sending Clerk the wrong name.
 *  3. **A double-submit latch on the code.** SMS and email autofill both fire
 *     the change handler twice, and the second attempt fails as a reused code
 *     — which surfaces as "incorrect code" for a code that was correct.
 *
 * ── The code step the design does not draw ───────────────────────────────
 *
 * The handoff shows a form and then the app. Clerk instances with email
 * verification on — which is the default, and which this deployment uses —
 * answer a sign-up with `missing_requirements` and wait for a 6-digit code, so
 * there is a step between the two whether or not it was drawn. It renders in
 * the same shell with the same components rather than as a separate screen,
 * which is the smallest honest addition.
 */

/**
 * Re-exported so the screens have one import for the flow and its rules. The
 * implementations live in `./credentials`, which imports neither React nor
 * Clerk and is therefore the part that can actually be tested — see the
 * header there.
 */
export {
  isValidEmail,
  normaliseEmail,
  splitName,
  validate,
  type AuthMode,
  type FieldErrors,
} from "./credentials";

/** `form` is the screen as drawn; `code` is the verification step above. */
export type AuthStep = "form" | "code";

const RESEND_SECONDS = 30;

/**
 * Clerk rejects parameters an instance has switched off rather than ignoring
 * them, so a name field that is not enabled fails the whole sign-up. This
 * spots exactly that answer, so the caller can retry without the name instead
 * of showing a customer an error about a field they filled in correctly.
 */
function rejectsNameParams(error: unknown): boolean {
  if (!isClerkAPIResponseError(error)) return false;
  return error.errors.some(
    (e) =>
      e.code === "form_param_unknown" &&
      (e.meta?.paramName === "first_name" || e.meta?.paramName === "last_name"),
  );
}

interface State {
  step: AuthStep;
  name: string;
  email: string;
  password: string;
  code: string;
  remember: boolean;
  prompt: FactorPrompt | null;
  fieldErrors: FieldErrors;
  error: string | null;
  notice: string | null;
  busy: boolean;
  resendIn: number;
}

export function useEmailPasswordAuth(mode: AuthMode, onDone: () => void) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signUp, setActive: setActiveSignUp } = useSignUp();

  const [state, setState] = useState<State>({
    step: "form",
    name: "",
    email: "",
    password: "",
    code: "",
    // The handoff: "'Remember me' persists the session; default on."
    remember: true,
    prompt: null,
    fieldErrors: {},
    error: null,
    notice: null,
    busy: false,
    resendIn: 0,
  });

  const patch = useCallback(
    (next: Partial<State>) => setState((s) => ({ ...s, ...next })),
    [],
  );

  /** See property 3 in this file's header. */
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
        });
        return;
      }
      patch({ busy: false, error: fallback });
    },
    [patch],
  );

  /** The session exists. Record the "remember me" choice and get out of the way. */
  const finish = useCallback(
    async (
      activate: () => Promise<void>,
    ): Promise<void> => {
      setRememberSession(state.remember);
      await activate();
      patch({ busy: false });
      onDone();
    },
    [state.remember, patch, onDone],
  );

  /** Everything a sign-in attempt can answer, in one place. */
  const advanceSignIn = useCallback(
    async (attempt: SignInResource): Promise<void> => {
      if (attempt.status === "complete") {
        await finish(() => setActive!({ session: attempt.createdSessionId }));
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const strategy =
          attempt.supportedSecondFactors?.[0]?.strategy ?? "totp";
        const prompt = describeSecondFactor(strategy);
        if (prompt.resendable && signIn) {
          await signIn.prepareSecondFactor({ strategy: "phone_code" });
        }
        submittedFor.current = null;
        patch({
          step: "code",
          prompt,
          code: "",
          busy: false,
          error: null,
          resendIn: prompt.resendable ? RESEND_SECONDS : 0,
        });
        return;
      }

      // Property 1: the password was offered and Clerk wants something else.
      // Read what it actually supports rather than insisting.
      if (attempt.status === "needs_first_factor") {
        const factors = (attempt.supportedFirstFactors ??
          []) as SignInFirstFactor[];
        const emailFactor = factors.find((f) => f.strategy === "email_code") as
          | Extract<SignInFirstFactor, { strategy: "email_code" }>
          | undefined;

        if (emailFactor && signIn) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
          submittedFor.current = null;
          patch({
            step: "code",
            prompt: {
              strategy: "email_code",
              title: "Check your email",
              helper: `We sent a 6-digit code to ${normaliseEmail(state.email)}.`,
              otp: true,
              resendable: true,
            },
            code: "",
            busy: false,
            error: null,
            resendIn: RESEND_SECONDS,
          });
          return;
        }

        patch({
          busy: false,
          error: `This account has no sign-in method this screen supports. Offered: ${
            factors.map((f) => f.strategy).join(", ") || "none"
          }.`,
        });
        return;
      }

      patch({
        busy: false,
        error: `Sign-in stopped at "${attempt.status}", which this screen does not handle yet.`,
      });
    },
    [finish, setActive, signIn, state.email, patch],
  );

  const advanceSignUp = useCallback(
    async (attempt: SignUpResource): Promise<void> => {
      if (attempt.status === "complete") {
        await finish(() =>
          setActiveSignUp!({ session: attempt.createdSessionId }),
        );
        return;
      }

      // Anything short of complete with email verification outstanding means
      // the code step. Asking Clerk to prepare it is safe to repeat.
      await attempt.prepareEmailAddressVerification({ strategy: "email_code" });
      submittedFor.current = null;
      patch({
        step: "code",
        prompt: {
          strategy: "email_code",
          title: "Confirm your email",
          helper: `We sent a 6-digit code to ${normaliseEmail(state.email)}.`,
          otp: true,
          resendable: true,
        },
        code: "",
        busy: false,
        error: null,
        resendIn: RESEND_SECONDS,
      });
    },
    [finish, setActiveSignUp, state.email, patch],
  );

  const submit = useCallback(async () => {
    if (!isLoaded || !signIn || !signUp) return;

    const values = {
      name: state.name,
      email: state.email,
      password: state.password,
    };
    const fieldErrors = validate(mode, values);
    if (Object.keys(fieldErrors).length > 0) {
      patch({ fieldErrors, error: null });
      return;
    }

    patch({ busy: true, error: null, fieldErrors: {} });
    const email = normaliseEmail(values.email);

    try {
      if (mode === "signIn") {
        await advanceSignIn(
          await signIn.create({ identifier: email, password: values.password }),
        );
        return;
      }

      const { first, last } = splitName(values.name);
      try {
        await advanceSignUp(
          await signUp.create({
            emailAddress: email,
            password: values.password,
            firstName: first,
            lastName: last || undefined,
          }),
        );
      } catch (err) {
        if (!rejectsNameParams(err)) throw err;
        // The instance does not collect names at sign-up. Create the account
        // without them rather than failing on a field the customer filled in
        // correctly; the profile screen can ask again later.
        await advanceSignUp(
          await signUp.create({
            emailAddress: email,
            password: values.password,
          }),
        );
      }
    } catch (err) {
      // An unknown email on sign-in is the one error worth rewriting: Clerk's
      // own wording ("Couldn't find your account") does not say what to do,
      // and the answer from this screen is one tap away.
      if (
        mode === "signIn" &&
        isClerkAPIResponseError(err) &&
        isUnknownAccount(err.errors)
      ) {
        patch({
          busy: false,
          error: "No account for that email. Create one instead.",
        });
        return;
      }
      fail(
        err,
        mode === "signIn"
          ? "Could not sign you in. Check your details and try again."
          : "Could not create your account. Check your details and try again.",
      );
    }
  }, [
    isLoaded,
    signIn,
    signUp,
    mode,
    state.name,
    state.email,
    state.password,
    patch,
    advanceSignIn,
    advanceSignUp,
    fail,
  ]);

  const submitCode = useCallback(
    async (raw?: string) => {
      const code = normaliseCode(raw ?? state.code);
      if (!isCompleteCode(code)) return;
      if (submittedFor.current === code) return;
      submittedFor.current = code;

      patch({ busy: true, error: null });
      try {
        if (mode === "signUp") {
          if (!signUp) return;
          await advanceSignUp(
            await signUp.attemptEmailAddressVerification({ code }),
          );
          return;
        }

        if (!signIn) return;
        const attempt =
          state.prompt && state.prompt.strategy !== "email_code"
            ? await signIn.attemptSecondFactor({
                // Property 2: passed through, never cast.
                strategy: state.prompt.strategy,
                code,
              } as AttemptSecondFactorParams)
            : await signIn.attemptFirstFactor({
                strategy: "email_code",
                code,
              });
        await advanceSignIn(attempt);
      } catch (err) {
        submittedFor.current = null;
        fail(err, "That code did not work. Check it and try again.");
      }
    },
    [
      state.code,
      state.prompt,
      mode,
      signIn,
      signUp,
      patch,
      advanceSignIn,
      advanceSignUp,
      fail,
    ],
  );

  const resend = useCallback(async () => {
    if (state.resendIn > 0) return;
    patch({ busy: true, error: null });
    try {
      if (mode === "signUp") {
        await signUp?.prepareEmailAddressVerification({
          strategy: "email_code",
        });
      } else if (state.prompt?.strategy === "email_code" && signIn) {
        const factors = (signIn.supportedFirstFactors ??
          []) as SignInFirstFactor[];
        const emailFactor = factors.find((f) => f.strategy === "email_code") as
          | Extract<SignInFirstFactor, { strategy: "email_code" }>
          | undefined;
        if (emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        }
      } else if (signIn) {
        await signIn.prepareSecondFactor({ strategy: "phone_code" });
      }
      submittedFor.current = null;
      patch({
        busy: false,
        code: "",
        notice: "We sent another code.",
        resendIn: RESEND_SECONDS,
      });
    } catch (err) {
      fail(err, "Could not send another code just yet.");
    }
  }, [state.resendIn, state.prompt, mode, signIn, signUp, patch, fail]);

  /** Back to the form from the code step, keeping what was typed. */
  const restart = useCallback(() => {
    submittedFor.current = null;
    patch({
      step: "form",
      code: "",
      prompt: null,
      error: null,
      notice: null,
      busy: false,
      resendIn: 0,
    });
  }, [patch]);

  return {
    ...state,
    isLoaded,
    setName: (name: string) =>
      patch({ name, fieldErrors: { ...state.fieldErrors, name: undefined } }),
    setEmail: (email: string) =>
      patch({ email, fieldErrors: { ...state.fieldErrors, email: undefined } }),
    setPassword: (password: string) =>
      patch({
        password,
        fieldErrors: { ...state.fieldErrors, password: undefined },
      }),
    setRemember: (remember: boolean) => patch({ remember }),
    setCode: (code: string) => patch({ code, error: null }),
    submit,
    submitCode,
    resend,
    restart,
  };
}
