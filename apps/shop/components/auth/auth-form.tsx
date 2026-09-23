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

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Checkbox } from "@repo/mobile-ui/components/ui/checkbox";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";

import { Icon } from "../icon";
import { AuthDivider, AuthFooterLink, AuthHeader } from "./auth-shell";
import { PillField } from "./pill-field";
import { SsoRow } from "./sso-row";
import {
  useEmailPasswordAuth,
  type AuthMode,
} from "../../lib/auth/use-password-auth";
import { useSocialSignIn } from "../../lib/auth/use-social-sign-in";

/**
 * Sign up and sign in. One component, because the handoff draws one screen:
 * "identical shell and component specs to sign up, with these differences".
 *
 * Layout is the handoff's: `28px 16px 24px` padding, a centred header block,
 * a 16px-gap form, the divider at `24px 0 18px`, the SSO row, and the footer
 * line pushed to the bottom of the viewport.
 *
 * ── The close control is an addition, and a necessary one ────────────────
 *
 * The handoff has no dismiss affordance, because in a prototype there is
 * nowhere to dismiss to. In this app auth is a MODAL over whatever route you
 * were on — that is what stops a sign-in mid-checkout losing your place on
 * reload — and browsing is deliberately open to people without an account. A
 * screen you cannot leave would trap every guest who opened it to look. It is
 * the one control here that the design does not specify.
 */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const auth = useEmailPasswordAuth(mode, () => router.back());
  const social = useSocialSignIn(() => router.back());

  const isSignUp = mode === "signUp";

  // Autosubmit on the sixth digit. Making someone press a button after typing
  // the last character of a code is a redundant tap.
  useEffect(() => {
    if (auth.step !== "code") return;
    if (auth.code.replace(/\s/g, "").length !== 6) return;
    void auth.submitCode();
    // `submitCode` latches on the value, so a re-run is a no-op rather than a
    // second attempt with an already-consumed code.
  }, [auth.code, auth.step]);

  const busy = auth.busy || social.pending !== null;

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="px-screen pt-space-2 flex-row items-center justify-between">
          <Pressable
            onPress={() => (auth.step === "code" ? auth.restart() : router.back())}
            accessibilityRole="button"
            accessibilityLabel={auth.step === "code" ? "Back" : "Close"}
            hitSlop={8}
            className="size-control -ml-space-2 rounded-pill items-center justify-center active:opacity-70"
          >
            <Icon
              name={auth.step === "code" ? "chevron-back" : "close"}
              size={24}
              tone="strong"
            />
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
          {auth.step === "code" ? (
            <CodeStep auth={auth} />
          ) : (
            <>
              <AuthHeader
                title={isSignUp ? "Create your account." : "Welcome back."}
                subtitle={
                  isSignUp
                    ? "Fill in the fields below and shop in 10 minutes."
                    : "Sign in and your shopping is at the gate in 10 minutes."
                }
              />

              <View className="gap-[16px]">
                {isSignUp ? (
                  <PillField
                    label="Name"
                    placeholder="Enter your name"
                    value={auth.name}
                    onChangeText={auth.setName}
                    error={auth.fieldErrors.name}
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    editable={!busy}
                    returnKeyType="next"
                  />
                ) : null}

                <PillField
                  label="Email"
                  placeholder="Enter your email"
                  value={auth.email}
                  onChangeText={auth.setEmail}
                  error={auth.fieldErrors.email}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!busy}
                  returnKeyType="next"
                />

                <PillField
                  label="Password"
                  placeholder={
                    isSignUp ? "Create a password" : "Enter your password"
                  }
                  value={auth.password}
                  onChangeText={auth.setPassword}
                  error={auth.fieldErrors.password}
                  reveal
                  autoCapitalize="none"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  textContentType={isSignUp ? "newPassword" : "password"}
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={() => void auth.submit()}
                />

                {/*
                  Sign up carries the checkbox alone; sign in puts "Forgot
                  password?" opposite it on the same row.
                */}
                <View className="-mt-[2px] flex-row items-center justify-between gap-[12px]">
                  <Pressable
                    onPress={() => auth.setRemember(!auth.remember)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: auth.remember }}
                    hitSlop={8}
                    className="gap-space-3 flex-row items-center active:opacity-70"
                  >
                    {/*
                      The row is the control; the box is its picture. Without
                      `accessible={false}` the primitive renders a second
                      focusable checkbox inside the first, so a screen reader
                      announces "Remember me" twice and lands on a node with
                      no label of its own.
                    */}
                    <Checkbox
                      accessible={false}
                      checked={auth.remember}
                      onCheckedChange={auth.setRemember}
                    />
                    <Text size="sm" className="text-ink-800">
                      Remember me
                    </Text>
                  </Pressable>

                  {!isSignUp ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(auth)/reset-password",
                          params: auth.email ? { email: auth.email } : {},
                        })
                      }
                      accessibilityRole="link"
                      hitSlop={8}
                      className="active:opacity-70"
                    >
                      <Text
                        size="sm"
                        weight="semibold"
                        className="text-ink-950 underline"
                      >
                        Forgot password?
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {auth.error ? (
                  <Text size="sm" variant="destructive">
                    {auth.error}
                  </Text>
                ) : null}

                <Button
                  label={isSignUp ? "Create account" : "Sign in"}
                  size="ctaLg"
                  full
                  loading={auth.busy}
                  disabled={busy || !auth.isLoaded}
                  onPress={() => void auth.submit()}
                />
              </View>

              <AuthDivider />

              <SsoRow
                onPress={(provider) => void social.signInWith(provider)}
                pending={social.pending}
                disabled={busy}
              />

              {social.error ? (
                <Text size="sm" variant="destructive" className="mt-space-3">
                  {social.error}
                </Text>
              ) : null}

              {/* `mt-auto` is what pins the footer to the bottom of the viewport. */}
              <View className="mt-auto">
                <AuthFooterLink
                  prompt={
                    isSignUp ? "Already have an account?" : "New to Blink?"
                  }
                  action={isSignUp ? "Sign in" : "Create an account"}
                  onPress={() =>
                    router.replace(
                      isSignUp ? "/(auth)/sign-in" : "/(auth)/sign-up",
                    )
                  }
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The verification code, in the same shell.
 *
 * Not in the handoff — see `use-password-auth.ts` for why it exists anyway.
 * Built from the same header and the same OTP component the rest of the app
 * uses, so it reads as one more step of this flow rather than a different
 * screen that happens to follow it.
 */
function CodeStep({
  auth,
}: {
  auth: ReturnType<typeof useEmailPasswordAuth>;
}) {
  return (
    <>
      <AuthHeader
        title={auth.prompt?.title ?? "Check your email"}
        subtitle={auth.prompt?.helper ?? ""}
      />

      <View className="gap-space-5">
        <OtpInput
          value={auth.code}
          onChange={auth.setCode}
          invalid={!!auth.error}
          autoFocus
          editable={!auth.busy}
        />

        {auth.error ? (
          <Text size="sm" variant="destructive" className="text-center">
            {auth.error}
          </Text>
        ) : null}

        {auth.notice && !auth.error ? (
          <Text size="sm" variant="muted" className="text-center">
            {auth.notice}
          </Text>
        ) : null}

        {/*
          Resend is offered only for codes the SERVER sent. An authenticator
          code is generated on the customer's own device, so a resend button
          there would be a lie.
        */}
        {(auth.prompt?.resendable ?? true) ? (
          <Pressable
            onPress={() => void auth.resend()}
            disabled={auth.resendIn > 0 || auth.busy}
            accessibilityRole="button"
            className="items-center active:opacity-70"
          >
            <Text
              size="sm"
              variant={auth.resendIn > 0 ? "subtle" : "default"}
              weight={auth.resendIn > 0 ? "regular" : "semibold"}
            >
              {auth.resendIn > 0
                ? `Resend in ${auth.resendIn}s`
                : "Send a new code"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}
