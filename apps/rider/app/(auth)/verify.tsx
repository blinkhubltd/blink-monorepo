import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { OtpInput } from "../../components/OtpInput";
import { Screen } from "../../components/Screen";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

/** "+254712345678" -> "+254 712 ••• 678" */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return phone;
  const local = digits.slice(-9);
  return `+254 ${local.slice(0, 3)} ••• ${local.slice(-3)}`;
}

export default function VerifyRoute() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
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
    // without this guard the verify mutation runs twice.
    if (submittedFor.current === value) return;
    submittedFor.current = value;
    setSubmitting(true);
    setInvalid(false);
    try {
      // Clerk attemptFirstFactor goes here.
      router.replace("/(tabs)");
    } catch {
      setInvalid(true);
      setCode("");
      submittedFor.current = null;
    } finally {
      setSubmitting(false);
    }
  }

  function onChange(value: string) {
    setCode(value);
    setInvalid(false);
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
            {phone ? maskPhone(phone) : "your phone"}.
          </Text>
        </View>

        <OtpInput
          value={code}
          onChange={onChange}
          length={CODE_LENGTH}
          invalid={invalid}
          editable={!submitting}
          autoFocus
        />
        {invalid ? (
          <Text variant="destructive" size="sm">
            That code didn’t match. Try again.
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
              onPress={() => setSecondsLeft(RESEND_SECONDS)}
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
