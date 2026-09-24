import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import type { SignInFirstFactor, SignInSecondFactor } from "@clerk/types";
import { clerkErrorMessage } from "@repo/lib/auth";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import {
  AuthFooterLink,
  AuthHeader,
  AuthShell,
} from "../../components/auth/auth-shell";
import { PillField } from "../../components/auth/pill-field";
import { normaliseEmail, validate, type FieldErrors } from "../../lib/auth/credentials";

/**
 * Rider sign-in: email and password, no sign-up and no social buttons.
 *
 * Riders never register themselves — a hub lead invites them by email from
 * the admin dashboard — but that is never something a failed sign-in attempt
 * says out loud. An unknown email and a wrong password get the same message
 * (`AMBIGUOUS_ERROR_CODES` below): telling an anonymous caller which one it
 * was turns this screen into an account-enumeration oracle, so a rider who
 * mistypes their address sees exactly what someone probing for valid emails
 * would see. "Forgot password?" (`reset-password.tsx`) keeps that same
 * property on its own path.
 *
 * A password is offered, never assumed: `signIn.create` can come back wanting
 * an emailed code instead (a passwordless instance, or Clerk's new-device
 * check after a correct password), and this reads what was actually offered
 * rather than insisting on one path. That code step is `verify.tsx`, a
 * separate route rather than folded into this screen, matching the phone-OTP
 * flow this replaces.
 */

/**
 * All mean "that did not work", not "which one was wrong" — see the header
 * above. Kept local rather than imported from `@repo/lib/auth`'s
 * `clerkErrorMessage`, whose ambiguous wording ("That did not match an
 * account...") is written for a screen with a sign-up link next to it. This
 * one has none, so the message says where to actually go instead.
 *
 * `strategy_for_user_invalid` is the account that exists but has NO password —
 * one made under the old phone-OTP sign-in, or created without one. Clerk's
 * own text for it ("The verification strategy is not valid for this
 * account") is both meaningless to a rider and a tell that the email is
 * registered, which is exactly what the other two codes are folded together
 * to hide. Such a rider sets a password through "Forgot password?".
 */
const AMBIGUOUS_ERROR_CODES = new Set([
  "form_identifier_not_found",
  "form_password_incorrect",
  "strategy_for_user_invalid",
]);

/** Sends the code for whichever second factor Clerk actually offered. */
function prepareSecondFactor(
  signIn: NonNullable<ReturnType<typeof useSignIn>["signIn"]>,
  factor: SignInSecondFactor,
) {
  if (factor.strategy === "email_code") {
    return signIn.prepareSecondFactor({
      strategy: "email_code",
      emailAddressId: factor.emailAddressId,
    });
  }
  if (factor.strategy === "phone_code") {
    return signIn.prepareSecondFactor({
      strategy: "phone_code",
      phoneNumberId: factor.phoneNumberId,
    });
  }
  // TOTP and backup codes are not sent; nothing to prepare.
  return Promise.resolve(signIn);
}

export default function SignInRoute() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isLoaded && !submitting;

  async function onSubmit() {
    if (!canSubmit || !signIn) return;

    const errors = validate({ email, password });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    const identifier = normaliseEmail(email);

    try {
      const attempt = await signIn.create({ identifier, password });

      if (attempt.status === "complete") {
        await setActive!({ session: attempt.createdSessionId });
        // Back to the gate rather than straight to the tabs: it is the one
        // place that decides whether this crew member may actually use the
        // app, same as the phone flow did.
        router.replace("/");
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const factor = attempt.supportedSecondFactors?.[0];
        if (factor) {
          if (factor.strategy === "email_code" || factor.strategy === "phone_code") {
            await prepareSecondFactor(signIn, factor);
          }
          router.push({
            pathname: "/(auth)/verify",
            params: { strategy: factor.strategy, factor: "second", email: identifier },
          });
          return;
        }
      }

      if (attempt.status === "needs_first_factor") {
        const factors = (attempt.supportedFirstFactors ?? []) as SignInFirstFactor[];
        const emailFactor = factors.find((f) => f.strategy === "email_code") as
          | Extract<SignInFirstFactor, { strategy: "email_code" }>
          | undefined;

        if (emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
          router.push({
            pathname: "/(auth)/verify",
            params: { strategy: "email_code", factor: "first", email: identifier },
          });
          return;
        }

        setError(
          `This account has no sign-in method this screen supports. Offered: ${
            factors.map((f) => f.strategy).join(", ") || "none"
          }.`,
        );
        return;
      }

      setError(`Sign-in stopped at "${attempt.status}", which this screen does not handle yet.`);
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        const code = err.errors[0]?.code;
        if (code && AMBIGUOUS_ERROR_CODES.has(code)) {
          setError("Wrong credentials. Please contact your admin.");
          return;
        }
        setError(clerkErrorMessage(err.errors, "Could not sign you in."));
        return;
      }
      setError("Could not sign you in. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      footer={
        <AuthFooterLink
          prompt="Not a Blink crew member?"
          action="Contact your hub lead"
          onPress={() => router.push("/(auth)/access-denied")}
        />
      }
    >
      <AuthHeader
        title="Welcome back."
        subtitle="Sign in with the email your hub lead invited."
      />

      <View className="gap-[16px]">
        <PillField
          label="Email"
          placeholder="Enter your email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setFieldErrors((e) => ({ ...e, email: undefined }));
            setError(null);
          }}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!submitting}
          returnKeyType="next"
        />

        <PillField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setFieldErrors((e) => ({ ...e, password: undefined }));
            setError(null);
          }}
          error={fieldErrors.password}
          reveal
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!submitting}
          returnKeyType="go"
          onSubmitEditing={() => void onSubmit()}
        />

        {/*
          The shop puts "Remember me" opposite this link. It is left out here
          rather than drawn: the shop honours it with a cold-start sign-out
          guard the rider app does not have, and a checkbox that changes
          nothing is worse than none.
        */}
        <View className="-mt-[2px] flex-row items-center justify-end">
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(auth)/reset-password",
                params: email ? { email } : {},
              })
            }
            accessibilityRole="link"
            hitSlop={8}
            className="active:opacity-70"
          >
            <Text size="sm" weight="semibold" className="text-ink-950 underline">
              Forgot password?
            </Text>
          </Pressable>
        </View>

        {error ? (
          <Text size="sm" variant="destructive">
            {error}
          </Text>
        ) : null}

        <Button
          label="Sign in"
          size="ctaLg"
          full
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void onSubmit()}
        />
      </View>
    </AuthShell>
  );
}
