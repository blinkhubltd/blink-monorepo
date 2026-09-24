import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import type { SignInFirstFactor, SignInSecondFactor } from "@clerk/types";
import { ArrowRight, Lock, Mail } from "lucide-react-native";
import { clerkErrorMessage } from "@repo/lib/auth";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../../components/Screen";
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
 * Both mean "that did not work", not "which one was wrong" — see the header
 * above. Kept local rather than imported from `@repo/lib/auth`'s
 * `clerkErrorMessage`, whose ambiguous wording ("That did not match an
 * account...") is written for a screen with a sign-up link next to it. This
 * one has none, so the message says where to actually go instead.
 */
const AMBIGUOUS_ERROR_CODES = new Set([
  "form_identifier_not_found",
  "form_password_incorrect",
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
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center gap-space-8 px-space-7 pb-space-8"
      >
        <View className="items-start gap-space-5">
          <Image
            source={require("../../assets/images/logo-blink-ink.png")}
            style={{ width: 84, height: 22 }}
            contentFit="contain"
          />
          <View className="gap-space-3">
            <Text variant="heading" size="h1">
              Sign in to Blink Riders
            </Text>
            <Text variant="muted">
              Use the email and password registered with your hub.
            </Text>
          </View>
        </View>

        <View className="gap-space-5">
          <Input
            label="Email"
            placeholder="you@blink.app"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setFieldErrors((e) => ({ ...e, email: undefined }));
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            error={fieldErrors.email}
            icon={<Mail size={18} strokeWidth={2} className="text-subtle" />}
          />
          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setFieldErrors((e) => ({ ...e, password: undefined }));
              setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            error={fieldErrors.password}
            icon={<Lock size={18} strokeWidth={2} className="text-subtle" />}
          />
          <Link
            href={{ pathname: "/(auth)/reset-password", params: { email } }}
            asChild
          >
            <Pressable accessibilityRole="button" className="self-end active:opacity-70">
              <Text size="sm" weight="semibold" className="text-strong">
                Forgot password?
              </Text>
            </Pressable>
          </Link>
          {error ? (
            <Text variant="destructive" size="sm">
              {error}
            </Text>
          ) : null}
          <Button
            label="Sign in"
            size="lg"
            full
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void onSubmit()}
            icon={
              <ArrowRight
                size={18}
                strokeWidth={2}
                className="text-primary-foreground"
              />
            }
          />
        </View>

        <View className="items-center gap-space-2">
          <Text variant="subtle" size="sm">
            Not a Blink crew member?{" "}
            <Link href="/(auth)/access-denied" asChild>
              <Text size="sm" weight="semibold" className="text-strong">
                Contact your hub lead
              </Text>
            </Link>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
