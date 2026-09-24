import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import type {
  AttemptFirstFactorParams,
  AttemptSecondFactorParams,
  SignInFirstFactor,
} from "@clerk/types";
import { clerkErrorMessage } from "@repo/lib/auth";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { AuthHeader, AuthShell } from "../../components/auth/auth-shell";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * Only "first" or "second" factor codes land here, both always `email_code`
 * for this deployment (no phone auth), but the strategy string still comes
 * from the route params — passed through, never hardcoded — because a second
 * factor is Clerk's own choice, not this screen's.
 */
export default function VerifyRoute() {
  const router = useRouter();
  const { email, strategy, factor } = useLocalSearchParams<{
    email?: string;
    strategy?: string;
    factor?: "first" | "second";
  }>();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const submittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  async function submit(value: string) {
    // Autofill can deliver the full code and fire onChange more than once;
    // without this guard the attempt runs twice and the second one fails as a
    // reused code.
    if (submittedFor.current === value || !isLoaded || !signIn || !setActive) {
      return;
    }
    submittedFor.current = value;
    setSubmitting(true);
    setError(null);
    try {
      const attempt =
        factor === "second"
          ? await signIn.attemptSecondFactor({
              strategy,
              code: value,
            } as AttemptSecondFactorParams)
          : await signIn.attemptFirstFactor({
              strategy: "email_code",
              code: value,
            } as AttemptFirstFactorParams);
      if (attempt.status !== "complete") {
        // Clerk can chain another factor. There is no UI for it here, so say
        // so rather than leaving the rider on a screen that cannot proceed.
        setError(
          "This account needs another verification step. Contact your hub lead.",
        );
        submittedFor.current = null;
        return;
      }
      await setActive({ session: attempt.createdSessionId });
      // Back to the gate rather than straight to the tabs: it is the one place
      // that decides whether this crew member may actually use the app.
      router.replace("/");
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(clerkErrorMessage(err.errors, "Verification failed."));
      } else {
        setError("Verification failed. Check your connection and try again.");
      }
      setCode("");
      submittedFor.current = null;
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!isLoaded || !signIn) return;
    setError(null);
    setCode("");
    submittedFor.current = null;
    try {
      if (factor === "second") {
        const found = signIn.supportedSecondFactors?.find(
          (f) => f.strategy === strategy,
        );
        if (found && (found.strategy === "email_code" || found.strategy === "phone_code")) {
          if (found.strategy === "email_code") {
            await signIn.prepareSecondFactor({
              strategy: "email_code",
              emailAddressId: found.emailAddressId,
            });
          } else {
            await signIn.prepareSecondFactor({
              strategy: "phone_code",
              phoneNumberId: found.phoneNumberId,
            });
          }
        }
      } else {
        const factors = (signIn.supportedFirstFactors ?? []) as SignInFirstFactor[];
        const emailFactor = factors.find((f) => f.strategy === "email_code") as
          | Extract<SignInFirstFactor, { strategy: "email_code" }>
          | undefined;
        if (emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        }
      }
      setSecondsLeft(RESEND_SECONDS);
      setNotice("We sent another code.");
    } catch {
      setError("Could not resend the code.");
    }
  }

  function onChange(value: string) {
    setCode(value);
    setError(null);
    if (value.length === CODE_LENGTH) void submit(value);
  }

  // The shop's code step, in the same shell as sign-in: no Verify button —
  // the sixth digit submits (`onChange` above), so a button would only ever
  // be a redundant tap.
  return (
    <AuthShell onBack={() => router.back()}>
      <AuthHeader
        title="Check your email"
        subtitle={`We sent a ${CODE_LENGTH}-digit code to ${email ?? "your email"}.`}
      />

      <View className="gap-space-5">
        <OtpInput
          value={code}
          onChange={onChange}
          length={CODE_LENGTH}
          invalid={error !== null}
          editable={!submitting}
          autoFocus
        />

        {submitting ? (
          <Text size="sm" variant="muted" className="text-center">
            Checking the code…
          </Text>
        ) : null}

        {error ? (
          <Text size="sm" variant="destructive" className="text-center">
            {error}
          </Text>
        ) : null}

        {notice && !error ? (
          <Text size="sm" variant="muted" className="text-center">
            {notice}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void resend()}
          disabled={secondsLeft > 0 || submitting}
          accessibilityRole="button"
          className="items-center active:opacity-70"
        >
          <Text
            size="sm"
            variant={secondsLeft > 0 ? "subtle" : "default"}
            weight={secondsLeft > 0 ? "regular" : "semibold"}
          >
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Send a new code"}
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
