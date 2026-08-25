import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { ArrowRight, Phone } from "lucide-react-native";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../../components/Screen";
import { toE164 } from "../../lib/phone";

export default function SignInRoute() {
  const router = useRouter();
  const { signIn, isLoaded } = useSignIn();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e164 = toE164(phone);
  const canSubmit = e164 !== null && isLoaded && !submitting;

  async function onSendCode() {
    if (!canSubmit || !signIn || !e164) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier: e164 });
      const factor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === "phone_code",
      );
      if (!factor || !("phoneNumberId" in factor)) {
        // The account exists but has no phone factor — an email-only Clerk user.
        // Saying so is better than a generic failure, because the fix is on the
        // hub's side, not the rider's.
        setError(
          "This number is registered without SMS sign-in. Ask your hub lead to enable it.",
        );
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "phone_code",
        phoneNumberId: factor.phoneNumberId,
      });
      router.push({ pathname: "/(auth)/verify", params: { phone: e164 } });
    } catch (err) {
      // A number with no Blink account is the common case, and Clerk reports it
      // as form_identifier_not_found. Route to the screen that explains that
      // rather than showing a raw API message inline.
      if (isClerkAPIResponseError(err)) {
        const code = err.errors[0]?.code;
        if (code === "form_identifier_not_found") {
          router.push("/(auth)/access-denied");
          return;
        }
        setError(err.errors[0]?.longMessage ?? "Could not send the code.");
        return;
      }
      setError("Could not send the code. Check your connection and try again.");
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
              Use the phone number registered with your hub.
            </Text>
          </View>
        </View>

        <View className="gap-space-5">
          <Input
            label="Phone number"
            placeholder="712 345 678"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={14}
            error={error ?? undefined}
            icon={<Phone size={18} strokeWidth={2} className="text-subtle" />}
          />
          <Button
            label="Send code"
            size="lg"
            full
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void onSendCode()}
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
