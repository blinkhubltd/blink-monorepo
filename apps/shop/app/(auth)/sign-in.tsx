import { useEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";

import { useSignInFlow } from "../../lib/auth/use-sign-in-flow";
import { useSocialSignIn } from "../../lib/auth/use-social-sign-in";

/**
 * Sign-in, presented as a modal over whatever route the customer was on.
 *
 * It dismisses in place rather than navigating: the URL never changes, so a
 * reload part-way through checkout returns to checkout. That is what removes
 * two of the eight refresh-to-home causes structurally rather than patching
 * them, and it is why there is no `redirect` param anywhere in this screen.
 *
 * One field to start. The account's own configuration decides what is asked for
 * next — an emailed code, a password, or a second factor — because assuming a
 * strategy is what broke this twice in the admin app.
 */
export default function SignInScreen() {
  const flow = useSignInFlow(() => router.back());
  const social = useSocialSignIn(() => router.back());

  // Autosubmit once six digits are in. A screen that makes you press a button
  // after typing the final digit is asking for a redundant tap.
  useEffect(() => {
    if (flow.code.replace(/\s/g, "").length !== 6) return;
    if (flow.step === "emailCode" || flow.step === "secondFactor") {
      void flow.submitCode();
    } else if (flow.step === "signUpCode") {
      void flow.submitSignUpCode();
    }
    // Safe to re-run: submitCode latches on the value, so a repeat is a no-op
    // rather than a second attempt with an already-consumed code.
  }, [flow.code, flow.step]);

  const heading =
    flow.step === "identifier"
      ? "Sign in to continue"
      : flow.step === "password"
        ? "Enter your password"
        : flow.step === "secondFactor"
          ? (flow.prompt?.title ?? "One more step")
          : "Check your email";

  const helper =
    flow.step === "identifier"
      ? "Browsing is open to everyone. You only need an account to place an order."
      : flow.step === "password"
        ? `for ${flow.email}`
        : flow.step === "secondFactor"
          ? (flow.prompt?.helper ?? "")
          : `We sent a 6-digit code to ${flow.email}.`;

  const isCodeStep =
    flow.step === "emailCode" ||
    flow.step === "signUpCode" ||
    flow.step === "secondFactor";
  const useOtpBoxes = isCodeStep && (flow.prompt?.otp ?? true);

  return (
    <SafeAreaView edges={["top", "bottom"]} className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-screen pt-space-2 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            className="size-control -ml-space-2 rounded-pill items-center justify-center active:opacity-70"
          >
            <X size={24} color="#0A0E16" />
          </Pressable>
          {flow.step !== "identifier" ? (
            <Pressable
              onPress={flow.restart}
              accessibilityRole="button"
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text size="sm" variant="muted">
                Start over
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          contentContainerClassName="px-screen gap-space-6 pt-space-6 pb-space-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-space-2">
            <Text variant="heading" size="h1">
              {heading}
            </Text>
            <Text variant="muted" size="sm">
              {helper}
            </Text>
          </View>

          {flow.step === "identifier" ? (
            <View className="gap-space-6">
              <View className="gap-space-3">
                <Button
                  label="Continue with Google"
                  variant="outline"
                  size="lg"
                  full
                  loading={social.pending === "google"}
                  disabled={social.pending !== null}
                  onPress={() => void social.signInWith("google")}
                />
                {/*
                  Apple only — Sign in with Apple is an iOS convention (and an
                  App Store requirement once another social option is offered,
                  guideline 4.8), not an Android one. Clerk's OAuth strategy
                  could technically render on Android too, but nobody expects
                  the button there.
                */}
                {Platform.OS === "ios" ? (
                  <Button
                    label="Continue with Apple"
                    variant="outline"
                    size="lg"
                    full
                    loading={social.pending === "apple"}
                    disabled={social.pending !== null}
                    onPress={() => void social.signInWith("apple")}
                  />
                ) : null}
                {social.error ? (
                  <Text size="sm" variant="destructive">
                    {social.error}
                  </Text>
                ) : null}
              </View>

              <View className="flex-row items-center gap-space-3">
                <View className="border-t-hairline border-border flex-1" />
                <Text size="caption" variant="subtle">
                  or continue with email
                </Text>
                <View className="border-t-hairline border-border flex-1" />
              </View>

              <View className="gap-space-4">
                <Input
                  value={flow.email}
                  onChangeText={flow.setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  onSubmitEditing={() => void flow.submitIdentifier()}
                  returnKeyType="go"
                  editable={!flow.busy}
                />
                <Button
                  label="Continue"
                  size="lg"
                  full
                  loading={flow.busy}
                  disabled={!flow.isLoaded || flow.email.trim().length === 0}
                  onPress={() => void flow.submitIdentifier()}
                />
              </View>
            </View>
          ) : null}

          {flow.step === "password" ? (
            <View className="gap-space-4">
              <Input
                value={flow.password}
                onChangeText={flow.setPassword}
                placeholder="Password"
                secureTextEntry
                autoCapitalize="none"
                textContentType="password"
                autoComplete="current-password"
                autoFocus
                onSubmitEditing={() => void flow.submitPassword()}
                returnKeyType="go"
                editable={!flow.busy}
              />
              <Button
                label="Sign in"
                size="lg"
                full
                loading={flow.busy}
                disabled={flow.password.length === 0}
                onPress={() => void flow.submitPassword()}
              />
            </View>
          ) : null}

          {useOtpBoxes ? (
            <View className="gap-space-5">
              <OtpInput
                value={flow.code}
                onChange={flow.setCode}
                invalid={!!flow.error}
                autoFocus
                editable={!flow.busy}
              />
              {/*
                Resend is offered only for codes the SERVER sent. A backup code
                or an authenticator code is generated on the customer's own
                device, so a resend button there would be a lie.
              */}
              {(flow.prompt?.resendable ?? true) ? (
                <Pressable
                  onPress={() => void flow.resend()}
                  disabled={flow.resendIn > 0 || flow.busy}
                  accessibilityRole="button"
                  className="items-center active:opacity-70"
                >
                  <Text
                    size="sm"
                    variant={flow.resendIn > 0 ? "subtle" : "default"}
                    weight={flow.resendIn > 0 ? "regular" : "semibold"}
                  >
                    {flow.resendIn > 0
                      ? `Resend in ${flow.resendIn}s`
                      : "Send a new code"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* A backup code is not six digits, so it gets a plain field. */}
          {isCodeStep && !useOtpBoxes ? (
            <View className="gap-space-4">
              <Input
                value={flow.code}
                onChangeText={flow.setCode}
                placeholder="Backup code"
                autoCapitalize="none"
                autoFocus
                editable={!flow.busy}
              />
              <Button
                label="Verify"
                size="lg"
                full
                loading={flow.busy}
                onPress={() => void flow.submitCode()}
              />
            </View>
          ) : null}

          {/*
            An unknown email offers to create the account rather than saying
            "access denied" — that is the rider app's rule, right for a closed
            roster and absurd for a shop, where this is a prospective customer.
          */}
          {flow.unknownAccount ? (
            <View className="gap-space-3 border-hairline border-border p-space-5 rounded-lg">
              <Text size="base" weight="semibold">
                No account for {flow.email}
              </Text>
              <Text size="sm" variant="muted">
                Create one now — we will email a code to confirm it. Your basket
                comes with you.
              </Text>
              <Button
                label="Create account"
                variant="inverse"
                loading={flow.busy}
                onPress={() => void flow.startSignUp()}
              />
            </View>
          ) : null}

          {flow.error && !flow.unknownAccount ? (
            <Text size="sm" variant="destructive">
              {flow.error}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
