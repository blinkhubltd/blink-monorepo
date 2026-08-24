import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { ArrowRight, Phone } from "lucide-react-native";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../../components/Screen";

/** Local numbers are 9 digits after the +254 prefix. */
const LOCAL_DIGITS = 9;

export default function SignInRoute() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const canSubmit = digits.length === LOCAL_DIGITS && !submitting;

  async function onSendCode() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Clerk phone sign-in goes here; navigation carries the number so the
      // verify screen can display and resend against it.
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: `+254${digits}` },
      });
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
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={12}
            icon={<Phone size={18} strokeWidth={2} className="text-subtle" />}
          />
          <Button
            label="Send code"
            size="lg"
            full
            loading={submitting}
            disabled={!canSubmit}
            onPress={onSendCode}
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
