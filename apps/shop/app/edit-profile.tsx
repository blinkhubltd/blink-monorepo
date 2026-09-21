import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Label } from "@repo/mobile-ui/components/ui/label";

import { ScreenHeader } from "../components/screen-header";
import { PhoneSection, SectionCard } from "../components/checkout/sections";

/**
 * Edit your details.
 *
 * ── Two stores, stated plainly ───────────────────────────────────────────
 *
 * The name lives in Clerk and the phone number lives in Convex, and this screen
 * writes to both. That split is not incidental: the phone number is what a rider
 * calls, so it has to be readable by the backend that dispatches them, while the
 * name belongs to the identity provider that owns the session.
 *
 * They are saved independently, and the outcome of each is reported separately —
 * a failure updating one must not read as a failure of both, which is what a
 * single "Save" with one error banner would give.
 *
 * ── The email is shown, not editable ─────────────────────────────────────
 *
 * Changing it means re-verification through Clerk, and `users.email` is a
 * required field the webhook writes — so an email change that succeeds in Clerk
 * and fails to propagate leaves the account unreachable. Out of scope here rather
 * than half-built: the screen says where to go instead.
 */
export default function EditProfileScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  // `undefined` while loading, `null` when nothing is saved.
  const myPhone = useQuery(api.user.users.getMyPhone, isSignedIn ? {} : "skip");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const [savingName, setSavingName] = useState(false);
  const [nameResult, setNameResult] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Prefill once. Guarded by a flag rather than by dependencies, so a
  // subscription update cannot overwrite what is being typed.
  useEffect(() => {
    if (prefilled || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setPrefilled(true);
  }, [prefilled, user]);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your details" />
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

  const nameChanged =
    firstName.trim() !== (user?.firstName ?? "") ||
    lastName.trim() !== (user?.lastName ?? "");

  async function saveName() {
    if (!user) return;
    setSavingName(true);
    setNameError(null);
    setNameResult(null);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setNameResult("Saved");
    } catch (caught) {
      setNameError(
        caught instanceof Error ? caught.message : "Could not save your name.",
      );
    } finally {
      setSavingName(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Your details" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-screen gap-space-4 pb-space-10"
          keyboardShouldPersistTaps="handled"
        >
          <SectionCard title="Name">
            <View className="gap-space-2">
              <Label nativeID="first">First name</Label>
              <Input
                aria-labelledby="first"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                textContentType="givenName"
              />
            </View>
            <View className="gap-space-2">
              <Label nativeID="last">Last name</Label>
              <Input
                aria-labelledby="last"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                textContentType="familyName"
              />
            </View>
            {nameError ? (
              <Text size="sm" variant="destructive">
                {nameError}
              </Text>
            ) : nameResult ? (
              <Text size="sm" variant="muted">
                {nameResult}
              </Text>
            ) : null}
            <Button
              variant="outline"
              label="Save name"
              loading={savingName}
              disabled={!nameChanged || savingName}
              onPress={() => void saveName()}
            />
          </SectionCard>

          <PhoneSection
            stored={myPhone}
            title="Phone"
            helper="The rider calls this number if they cannot find you, so keep it one you answer."
            missingHelper="No number saved yet. Add one so a rider can reach you."
          />

          <SectionCard title="Email">
            <Text size="sm">
              {user?.primaryEmailAddress?.emailAddress ?? "—"}
            </Text>
            <Text size="caption" variant="subtle">
              Changing your email needs re-verification, and it is what your
              orders are tied to. Contact support to change it.
            </Text>
          </SectionCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
