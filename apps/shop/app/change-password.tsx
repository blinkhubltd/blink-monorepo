import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Label } from "@repo/mobile-ui/components/ui/label";

import { ScreenHeader } from "../components/screen-header";
import { SectionCard } from "../components/checkout/sections";
import { useToast } from "../providers/ToastProvider";

const MIN_LENGTH = 8;

/**
 * Change (or set) a password.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 *
 * Sign-in supports both a code and a password (see `(auth)/sign-in.tsx`'s
 * step machine) — Clerk decides which an account has per its own settings.
 * An account that HAS one had no way to change it from inside the app.
 *
 * ── "Change" and "set" are the same screen ────────────────────────────
 *
 * `user.passwordEnabled` is real and per-account: someone who has only ever
 * signed in by code has no password yet, and asking them for their
 * "current" one has nothing to check it against. The current-password field
 * is shown only when one exists — Clerk's own `updatePassword` accepts a
 * missing `currentPassword` for exactly this case, so this is not a
 * workaround, it is the intended shape of the call.
 *
 * ── Other sessions are signed out on a change, not asked about ────────
 *
 * The design carries no toggle for this. Signing out everywhere else is the
 * ordinary security posture for a password change — it is what stops a
 * session on a lost or shared device outliving the credential that granted
 * it — so it is the fixed behaviour rather than an extra decision to expose.
 */
export default function ChangePasswordScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Change password" />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Text size="lg" weight="semibold">
            Sign in first
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const hasPassword = user?.passwordEnabled ?? false;
  const mismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const valid =
    newPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    (!hasPassword || currentPassword.length > 0);

  async function save() {
    if (!user || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await user.updatePassword({
        newPassword,
        currentPassword: hasPassword ? currentPassword : undefined,
        signOutOfOtherSessions: true,
      });
      toast(hasPassword ? "Password changed" : "Password set");
      router.back();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save that password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title={hasPassword ? "Change password" : "Set a password"} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-screen gap-space-4 py-space-4 pb-space-10"
          keyboardShouldPersistTaps="handled"
        >
          <SectionCard title={hasPassword ? "Change password" : "Set a password"}>
            {hasPassword ? (
              <View className="gap-space-2">
                <Label nativeID="current">Current password</Label>
                <Input
                  aria-labelledby="current"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                  autoComplete="current-password"
                />
              </View>
            ) : (
              <Text size="sm" variant="muted">
                You currently sign in with an emailed code. Setting a
                password gives you a second way in — the code still works
                either way.
              </Text>
            )}

            <View className="gap-space-2">
              <Label nativeID="new">New password</Label>
              <Input
                aria-labelledby="new"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                autoCapitalize="none"
                textContentType="newPassword"
                autoComplete="new-password"
              />
            </View>

            <View className="gap-space-2">
              <Label nativeID="confirm">Confirm password</Label>
              <Input
                aria-labelledby="confirm"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                secureTextEntry
                autoCapitalize="none"
                textContentType="newPassword"
                autoComplete="new-password"
              />
              {mismatch ? (
                <Text size="caption" variant="destructive">
                  Passwords do not match.
                </Text>
              ) : null}
            </View>

            {error ? (
              <Text size="sm" variant="destructive">
                {error}
              </Text>
            ) : null}

            <Button
              label={hasPassword ? "Save password" : "Set password"}
              size="cta"
              full
              loading={saving}
              disabled={!valid || saving}
              onPress={() => void save()}
            />
          </SectionCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
