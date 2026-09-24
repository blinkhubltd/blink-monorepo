import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { AuthHeader, AuthShell } from "../../components/auth/auth-shell";
import { PillField } from "../../components/auth/pill-field";
import { usePasswordReset } from "../../lib/auth/use-password-reset";

/**
 * What "Forgot password?" on sign-in opens, in the same shell as sign-in.
 *
 * Three steps — email, code, new password — rather than the shop's two: see
 * `usePasswordReset`'s header. Whichever email is typed on the first step,
 * the screen advances the same way, so it cannot be used to find out which
 * addresses belong to riders.
 *
 * Also the way in for a rider whose account has no password yet (one made
 * under the old phone-OTP sign-in): sign-in answers them with the same
 * ambiguous error as a wrong password, and this is where they set one.
 */
export default function ResetPasswordRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const reset = usePasswordReset(params.email ?? "", () => {
    // The session is live at this point, so leaving sign-in underneath would
    // ask an already-signed-in rider to sign in again.
    router.dismissTo("/");
  });

  const header = {
    email: {
      title: "Reset your password.",
      subtitle: "We will email you a code to set a new one.",
    },
    code: {
      title: "Check your email.",
      subtitle: `Enter the 6-digit code we sent to ${reset.email}.`,
    },
    password: {
      title: "Choose a new password.",
      subtitle: "At least 8 characters. You will be signed in straight after.",
    },
  }[reset.step];

  return (
    <AuthShell
      onBack={() => (reset.step === "email" ? router.back() : reset.back())}
    >
      <AuthHeader title={header.title} subtitle={header.subtitle} />

      {reset.step === "email" ? (
        <View className="gap-[16px]">
          <PillField
            label="Email"
            placeholder="Enter your email"
            value={reset.email}
            onChangeText={reset.setEmail}
            error={reset.fieldError}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!reset.busy}
            returnKeyType="go"
            onSubmitEditing={() => void reset.sendCode()}
          />

          {reset.error ? (
            <Text size="sm" variant="destructive">
              {reset.error}
            </Text>
          ) : null}

          <Button
            label="Send reset code"
            size="ctaLg"
            full
            loading={reset.busy}
            disabled={reset.busy || !reset.isLoaded}
            onPress={() => void reset.sendCode()}
          />
        </View>
      ) : null}

      {reset.step === "code" ? (
        // No button: the sixth digit submits (`reset.setCode`).
        <View className="gap-space-5">
          <OtpInput
            value={reset.code}
            onChange={reset.setCode}
            invalid={!!reset.error}
            autoFocus
            editable={!reset.busy}
          />

          {reset.busy ? (
            <Text size="sm" variant="muted" className="text-center">
              Checking the code…
            </Text>
          ) : null}

          {reset.error ? (
            <Text size="sm" variant="destructive" className="text-center">
              {reset.error}
            </Text>
          ) : null}

          {reset.notice && !reset.error ? (
            <Text size="sm" variant="muted" className="text-center">
              {reset.notice}
            </Text>
          ) : null}

          <Pressable
            onPress={() => void reset.resend()}
            disabled={reset.resendIn > 0 || reset.busy}
            accessibilityRole="button"
            className="items-center active:opacity-70"
          >
            <Text
              size="sm"
              variant={reset.resendIn > 0 ? "subtle" : "default"}
              weight={reset.resendIn > 0 ? "regular" : "semibold"}
            >
              {reset.resendIn > 0
                ? `Resend in ${reset.resendIn}s`
                : "Send a new code"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {reset.step === "password" ? (
        <View className="gap-[16px]">
          <PillField
            label="New password"
            placeholder="Create a password"
            value={reset.password}
            onChangeText={reset.setPassword}
            error={reset.fieldError}
            reveal
            autoFocus
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!reset.busy}
            returnKeyType="go"
            onSubmitEditing={() => void reset.submitPassword()}
          />

          {reset.error ? (
            <Text size="sm" variant="destructive">
              {reset.error}
            </Text>
          ) : null}

          <Button
            label="Set new password"
            size="ctaLg"
            full
            loading={reset.busy}
            disabled={reset.busy}
            onPress={() => void reset.submitPassword()}
          />
        </View>
      ) : null}
    </AuthShell>
  );
}
