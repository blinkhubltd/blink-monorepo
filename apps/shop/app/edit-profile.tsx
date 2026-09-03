import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Label } from "@repo/mobile-ui/components/ui/label";

import { ScreenHeader } from "../components/screen-header";
import { SectionCard } from "../components/checkout/sections";

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

  const access = useQuery(
    api.user.access.getMyAccess,
    isSignedIn ? {} : "skip",
  );
  const setMyPhone = useMutation(api.user.users.setMyPhone);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const [savingName, setSavingName] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [nameResult, setNameResult] = useState<string | null>(null);
  const [phoneResult, setPhoneResult] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const storedPhone =
    access && "hasUser" in access && access.hasUser
      ? ((access as { phone?: string }).phone ?? "")
      : "";

  // Prefill once. Guarded by a flag rather than by dependencies, so a
  // subscription update cannot overwrite what is being typed.
  useEffect(() => {
    if (prefilled || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setPrefilled(true);
  }, [prefilled, user]);

  useEffect(() => {
    if (phone || !storedPhone) return;
    setPhone(storedPhone);
  }, [phone, storedPhone]);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your details" showCart={false} />
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
  const phoneChanged = phone.replace(/[\s-]/g, "") !== storedPhone;

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

  async function savePhone() {
    setSavingPhone(true);
    setPhoneError(null);
    setPhoneResult(null);
    try {
      await setMyPhone({ phone });
      setPhoneResult("Saved");
    } catch (caught) {
      setPhoneError(
        caught instanceof Error
          ? caught.message
          : "Could not save that number.",
      );
    } finally {
      setSavingPhone(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Your details" showCart={false} />

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

          <SectionCard title="Phone">
            <Text size="sm" variant="muted">
              The rider calls this number if they cannot find you, so keep it
              one you answer.
            </Text>
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="+254…"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              accessibilityLabel="Phone number"
            />
            {phoneError ? (
              <Text size="sm" variant="destructive">
                {phoneError}
              </Text>
            ) : phoneResult ? (
              <Text size="sm" variant="muted">
                {phoneResult}
              </Text>
            ) : null}
            <Button
              variant="outline"
              label="Save number"
              loading={savingPhone}
              disabled={!phoneChanged || savingPhone || phone.trim().length === 0}
              onPress={() => void savePhone()}
            />
          </SectionCard>

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
