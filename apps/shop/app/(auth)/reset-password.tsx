import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";

import { Icon } from "../../components/icon";
import { AuthHeader } from "../../components/auth/auth-shell";
import { PillField } from "../../components/auth/pill-field";
import { usePasswordReset } from "../../lib/auth/use-password-reset";

/**
 * What "Forgot password?" on the sign-in screen opens.
 *
 * The handoff specifies the link and "a password-reset trigger" behind it, and
 * nothing more — so this screen borrows sign-in's own shell, header and pill
 * fields rather than inventing a second visual language for two steps.
 *
 * The email arrives as a param when sign-in already had one typed, which is
 * the common case: someone types their address, fails on the password, and
 * taps the link. Retyping it there would be this screen forgetting something
 * it was just told.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const reset = usePasswordReset(params.email ?? "", () => {
    // Pop the reset screen AND the sign-in modal underneath it: the session is
    // live, so leaving sign-in on screen behind this would ask someone to sign
    // in to an account they are already signed in to.
    router.back();
    router.back();
  });

  const onEmailStep = reset.step === "email";

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-screen pt-space-2 flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            className="size-control -ml-space-2 rounded-pill items-center justify-center active:opacity-70"
          >
            <Icon name="chevron-back" size={24} tone="strong" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 28,
            paddingHorizontal: 16,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHeader
            title={onEmailStep ? "Reset your password." : "Check your email."}
            subtitle={
              onEmailStep
                ? "We will email you a code to set a new one."
                : `Enter the 6-digit code we sent to ${reset.email}, and choose a new password.`
            }
          />

          {onEmailStep ? (
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
          ) : (
            <View className="gap-[16px]">
              <OtpInput
                value={reset.code}
                onChange={reset.setCode}
                invalid={!!reset.error}
                autoFocus
                editable={!reset.busy}
              />

              <PillField
                label="New password"
                placeholder="Create a password"
                value={reset.password}
                onChangeText={reset.setPassword}
                error={reset.fieldError}
                reveal
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!reset.busy}
                returnKeyType="go"
                onSubmitEditing={() => void reset.submitReset()}
              />

              {reset.error ? (
                <Text size="sm" variant="destructive">
                  {reset.error}
                </Text>
              ) : null}

              {reset.notice && !reset.error ? (
                <Text size="sm" variant="muted">
                  {reset.notice}
                </Text>
              ) : null}

              <Button
                label="Set new password"
                size="ctaLg"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
