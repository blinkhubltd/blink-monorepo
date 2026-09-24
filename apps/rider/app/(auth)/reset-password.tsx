import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Lock, Mail } from "lucide-react-native";
import { OtpInput } from "../../components/OtpInput";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { usePasswordReset } from "../../lib/auth/use-password-reset";

/**
 * What "Forgot password?" on sign-in opens.
 *
 * Two steps: ask for the email, then ask for the code and new password
 * together. Whichever email is typed on the first step, the screen advances
 * the same way — see `usePasswordReset`'s header for why that is deliberate
 * rather than an oversight.
 */
export default function ResetPasswordRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const reset = usePasswordReset(params.email ?? "", () => {
    // The session is live at this point, so leaving sign-in underneath would
    // ask an already-signed-in rider to sign in again.
    router.dismissTo("/");
  });

  const onEmailStep = reset.step === "email";

  return (
    <Screen scroll={false}>
      <ScreenHeader title="Reset password" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center gap-space-8 px-space-7 pb-space-8"
      >
        <View className="gap-space-3">
          <Text variant="heading" size="h1">
            {onEmailStep ? "Reset your password" : "Check your email"}
          </Text>
          <Text variant="muted">
            {onEmailStep
              ? "We'll email you a code to set a new one."
              : `Enter the 6-digit code we sent to ${reset.email}, and choose a new password.`}
          </Text>
        </View>

        {onEmailStep ? (
          <View className="gap-space-5">
            <Input
              label="Email"
              placeholder="you@blink.app"
              value={reset.email}
              onChangeText={reset.setEmail}
              error={reset.fieldError ?? undefined}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!reset.busy}
              returnKeyType="go"
              onSubmitEditing={() => void reset.sendCode()}
              icon={<Mail size={18} strokeWidth={2} className="text-subtle" />}
            />
            {reset.error ? (
              <Text variant="destructive" size="sm">
                {reset.error}
              </Text>
            ) : null}
            <Button
              label="Send reset code"
              size="lg"
              full
              loading={reset.busy}
              disabled={reset.busy || !reset.isLoaded}
              onPress={() => void reset.sendCode()}
            />
          </View>
        ) : (
          <View className="gap-space-5">
            <OtpInput
              value={reset.code}
              onChange={reset.setCode}
              length={6}
              invalid={!!reset.error}
              editable={!reset.busy}
              autoFocus
            />
            <Input
              label="New password"
              placeholder="Create a password"
              value={reset.password}
              onChangeText={reset.setPassword}
              error={reset.fieldError ?? undefined}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!reset.busy}
              returnKeyType="go"
              onSubmitEditing={() => void reset.submitReset()}
              icon={<Lock size={18} strokeWidth={2} className="text-subtle" />}
            />
            {reset.error ? (
              <Text variant="destructive" size="sm">
                {reset.error}
              </Text>
            ) : null}
            {reset.notice && !reset.error ? (
              <Text variant="muted" size="sm">
                {reset.notice}
              </Text>
            ) : null}
            <Button
              label="Set new password"
              size="lg"
              full
              loading={reset.busy}
              disabled={reset.busy}
              onPress={() => void reset.submitReset()}
            />
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
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
