import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input, Label } from "../components/form-field";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { ScreenHeader } from "../components/screen-header";
import { Icon } from "../components/icon";
import { PhoneField, joinPhone, splitPhone } from "../components/checkout/sections";
import { useToast } from "../providers/ToastProvider";
import { initialsOf } from "../lib/initials";

/**
 * Your details. URL `/edit-profile`.
 *
 * ── Two stores, one Save ─────────────────────────────────────────────────
 *
 * The name lives in Clerk and the phone number lives in Convex. That split is
 * not incidental: the phone number is what a rider calls, so it has to be
 * readable by the backend that dispatches them, while the name belongs to the
 * identity provider that owns the session.
 *
 * This screen used to expose that split, with a Save button per card. The
 * design consolidates them into one, which is the right call for a form of
 * four fields — but the reason for the old split was real, so it survives in
 * the error handling rather than in the layout: each store is written
 * separately and a failure names the field it belongs to. Half a save is
 * reported as half a save, never as a blanket "could not save".
 *
 * ── The photo is Clerk's, and writes immediately ─────────────────────────
 *
 * `setProfileImage` is its own call with its own failure mode, and picking a
 * photo is already an explicit act — so it applies on pick rather than
 * waiting behind Save. That also keeps `changed` honest: it tracks the text
 * fields, which are the only things Save is responsible for.
 *
 * ── The email is shown, not editable ─────────────────────────────────────
 *
 * Changing it means re-verification through Clerk, and `users.email` is a
 * required field the webhook writes — so an email change that succeeds in
 * Clerk and fails to propagate leaves the account unreachable. Out of scope
 * here rather than half-built: the field says where to go instead.
 */
export default function EditProfileScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const toast = useToast();

  // `undefined` while loading, `null` when nothing is saved.
  const myPhone = useQuery(api.user.users.getMyPhone, isSignedIn ? {} : "skip");
  const setMyPhone = useMutation(api.user.users.setMyPhone);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [namePrefilled, setNamePrefilled] = useState(false);

  const [dial, setDial] = useState("+254");
  const [national, setNational] = useState("");
  const [phonePrefilled, setPhonePrefilled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Prefill once, each from its own source. Guarded by flags rather than by
  // dependency arrays: both subscriptions update after a write lands, and
  // re-seeding would overwrite whatever is being typed at that moment.
  useEffect(() => {
    if (namePrefilled || !user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setNamePrefilled(true);
  }, [namePrefilled, user]);

  useEffect(() => {
    if (phonePrefilled || myPhone === undefined) return;
    if (myPhone) {
      const split = splitPhone(myPhone);
      setDial(split.dial);
      setNational(split.national);
    }
    setPhonePrefilled(true);
  }, [phonePrefilled, myPhone]);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="User profile" />
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

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const savedPhone = myPhone ?? "";
  const nextPhone = joinPhone(dial, national);

  const nameChanged =
    firstName.trim() !== (user?.firstName ?? "") ||
    lastName.trim() !== (user?.lastName ?? "");
  // An empty field is "not filled in", not "clear my number": there is no way
  // to remove a number here, and `setMyPhone` would reject "" anyway.
  const phoneChanged = national.trim().length > 0 && nextPhone !== savedPhone;
  const changed = nameChanged || phoneChanged;

  async function pickPhoto() {
    setError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // Square, because the only place this is ever shown is a circle.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        exif: false,
      });
      // Cancelling is not a failure, and must not leave a spinner behind.
      if (picked.canceled) return;

      const asset = picked.assets[0];
      if (!asset || !user) return;

      setUploading(true);
      // Same approach as `use-prescription-upload.ts`: fetch the local uri as
      // a blob rather than handing across a file path, which keeps the type
      // the picker reported instead of guessing one.
      const blob = await (await fetch(asset.uri)).blob();
      await user.setProfileImage({ file: blob });
      toast("Photo updated");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update that photo.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!user || !changed) return;
    setSaving(true);
    setError(null);

    // Each store is written separately so a failure can name what failed.
    const failures: string[] = [];

    if (nameChanged) {
      try {
        await user.update({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      } catch (caught) {
        failures.push(
          caught instanceof Error ? caught.message : "Could not save your name.",
        );
      }
    }

    if (phoneChanged) {
      try {
        await setMyPhone({ phone: nextPhone });
      } catch (caught) {
        failures.push(
          caught instanceof Error
            ? caught.message
            : "Could not save your number.",
        );
      }
    }

    setSaving(false);

    if (failures.length > 0) {
      setError(failures.join(" "));
      return;
    }

    toast("Saved");
    router.back();
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="User profile" />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-screen gap-space-5 py-space-6 pb-space-10"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => void pickPhoto()}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Change your photo"
            className="self-center active:opacity-90"
          >
            <View className="size-[104px]">
              {user?.imageUrl ? (
                <OptimizedImage
                  source={{ uri: user.imageUrl }}
                  contentFit="cover"
                  className="size-[104px] rounded-pill"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View className="bg-secondary border-hairline border-border size-[104px] rounded-pill items-center justify-center">
                  <Text size="h3" weight="bold" variant="muted">
                    {initialsOf(user?.fullName ?? "", email)}
                  </Text>
                </View>
              )}

              {/*
                The camera badge, over the bottom-right of the circle. Also
                the upload indicator, so the spinner appears where the tap
                landed rather than somewhere else on the screen.
              */}
              <View className="bg-primary border-card absolute bottom-0 right-0 size-[32px] items-center justify-center rounded-pill border-[3px]">
                {uploading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Icon name="camera" size={14} tone="onBrand" />
                )}
              </View>
            </View>
          </Pressable>

          <View className="gap-space-4">
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

            <View className="gap-space-2">
              <Label nativeID="email">Email</Label>
              <Input
                aria-labelledby="email"
                value={email}
                editable={false}
                textContentType="emailAddress"
              />
              <Text size="caption" variant="subtle">
                Contact support to change this — it is what your orders are
                tied to.
              </Text>
            </View>

            <View className="gap-space-2">
              <Label nativeID="mobile">Mobile</Label>
              {/*
                The dial code stays its own control rather than becoming part
                of one free-text field, which is what it replaced: a number
                typed without a code, or with the trunk `0` left in front of
                it, is a number the rider cannot dial.
              */}
              <PhoneField
                dial={dial}
                national={national}
                onDialChange={setDial}
                onNationalChange={setNational}
              />
              <Text size="caption" variant="subtle">
                The rider calls this number if they cannot find you.
              </Text>
            </View>

            {error ? (
              <Text size="sm" variant="destructive">
                {error}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View className="border-t-hairline border-border bg-card px-screen py-space-4">
          <Button
            label="Save"
            size="cta"
            full
            loading={saving}
            disabled={!changed || saving}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
