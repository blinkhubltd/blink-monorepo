import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { OtpInput } from "../../components/OtpInput";
import { Screen } from "../../components/Screen";
import { maskE164 } from "../../lib/phone";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyRoute() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      const attempt = await signIn.attemptFirstFactor({
        strategy: "phone_code",
        code: value,
      });
      if (attempt.status !== "complete") {
        // Clerk can require a second factor. There is no UI for it here, so say
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
        const failed = err.errors[0]?.code;
        setError(
          failed === "form_code_incorrect" || failed === "verification_failed"
            ? "That code didn’t match. Try again."
            : (err.errors[0]?.longMessage ?? "Verification failed."),
        );
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
      const factor = signIn.supportedFirstFactors?.find(
        (f) => f.strategy === "phone_code",
      );
      if (factor && "phoneNumberId" in factor) {
        await signIn.prepareFirstFactor({
          strategy: "phone_code",
          phoneNumberId: factor.phoneNumberId,
        });
      }
      setSecondsLeft(RESEND_SECONDS);
    } catch {
      setError("Could not resend the code.");
    }
  }

  function onChange(value: string) {
    setCode(value);
    setError(null);
    if (value.length === CODE_LENGTH) void submit(value);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center gap-space-8 px-space-7 pb-space-8"
      >
        <View className="gap-space-3">
          <Text variant="heading" size="h1">
            Enter the code
          </Text>
          <Text variant="muted">
            We sent a {CODE_LENGTH}-digit code to{" "}
            {phone ? maskE164(phone) : "your phone"}.
          </Text>
        </View>

        <OtpInput
          value={code}
          onChange={onChange}
          length={CODE_LENGTH}
          invalid={error !== null}
          editable={!submitting}
          autoFocus
        />
        {error ? (
          <Text variant="destructive" size="sm">
            {error}
          </Text>
        ) : null}

        <View className="gap-space-5">
          <Button
            label="Verify"
            size="lg"
            full
            loading={submitting}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => void submit(code)}
          />
          {secondsLeft > 0 ? (
            <Text variant="subtle" size="sm" className="text-center">
              Resend code in{" "}
              <Text size="sm" weight="semibold" className="text-strong">
                {mm}:{ss}
              </Text>
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void resend()}
              className="active:opacity-70"
            >
              <Text
                size="sm"
                weight="semibold"
                className="text-center text-strong underline"
              >
                Resend code
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
