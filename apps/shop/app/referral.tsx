import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Input } from "@repo/mobile-ui/components/ui/input";

import { ScreenHeader } from "../components/screen-header";
import { SectionCard } from "../components/checkout/sections";

/**
 * Enter the referral code of the agent who signed you up. URL `/referral`.
 *
 * ── Why this screen exists at all ────────────────────────────────────────
 *
 * Registrations used to be credited by `incrementRegistrationCount`, a public
 * unauthenticated mutation keyed on the agent's code — the code printed on their
 * poster. Anyone could call it in a loop and mint earnings that flow to a real
 * payout. It is internal now, and `attributeMyRegistration` is the verified
 * replacement: it requires a signed-in account, credits at most once per account
 * ever, and refuses to credit an agent for their own sign-up.
 *
 * So the credit needs a real customer to enter the code, which is what this
 * screen is.
 *
 * ── The QR deep link carries the code, not the credit ────────────────────
 *
 * `blink://referral?code=<CODE>` (see `app/agent/index.tsx` for where it's
 * generated) opens this exact screen with the code param already in the URL.
 * A universal `https://` link is deliberately not used: `app.config.ts`'s
 * `associatedDomains` point at `blink.app`, which redirects to an unrelated
 * company (see `lib/legal.ts`'s comment on the same domain) — there is no real
 * website to fall back to yet, so the custom scheme is the only link that
 * actually resolves anywhere right now.
 *
 * The link pre-fills the field and, once signed in, submits it automatically
 * — the whole point of scanning a code is not typing it. It still goes through
 * `attributeMyRegistration` and its one-per-account guarantee unchanged; the
 * deep link is wiring, not a new door into the mutation.
 *
 * ── Outcomes are reported honestly ──────────────────────────────────────
 *
 * An unrecognised code is not distinguished from an unrecognised one on purpose:
 * the mutation returns the same shape either way so it cannot be used to
 * enumerate agent codes. The message here says the code was not applied, without
 * claiming whether it exists.
 */
export default function ReferralScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const attribute = useMutation(api.data.marketing.attributeMyRegistration);
  const { code: linkedCode } = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(linkedCode ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // A deep link with a code deserves the sign-in prompt without an extra tap
  // — the whole point of scanning is not doing the rest by hand. A plain
  // visit to /referral keeps the manual button below; nothing about that
  // path changed.
  useEffect(() => {
    if (isLoaded && !isSignedIn && linkedCode) {
      router.push("/(auth)/sign-in");
    }
  }, [isLoaded, isSignedIn, linkedCode]);

  // Submits once per deep-linked code, the moment a session exists to credit
  // it against. A ref rather than state: this must survive the sign-in modal
  // dismissing and this screen re-rendering, without re-arming on every
  // unrelated render the way a dependency-array effect would risk.
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!linkedCode || !isSignedIn || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void submit(linkedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCode, isSignedIn]);

  if (isLoaded && !isSignedIn && !linkedCode) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Referral code" showCart={false} />
        <View className="gap-space-4 px-screen py-space-8 items-center">
          <Text size="lg" weight="semibold" className="text-center">
            Sign in first
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            A referral is recorded against your account, so it needs one.
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  async function submit(value: string = code) {
    setBusy(true);
    setOutcome(null);
    setFailed(false);
    try {
      const result = await attribute({ agentCode: value });
      if (result.attributed) {
        setOutcome("Thank you — your referral has been recorded.");
      } else if (result.reason === "already") {
        setOutcome(
          "Your account already has a referral recorded. Only the first one counts.",
        );
        setFailed(true);
      } else if (result.reason === "self") {
        setOutcome("You cannot use your own referral code.");
        setFailed(true);
      } else {
        setOutcome(
          "That code was not applied. Check it with whoever gave it to you.",
        );
        setFailed(true);
      }
    } catch (caught) {
      setOutcome(
        caught instanceof Error
          ? caught.message
          : "Could not record that just now.",
      );
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title="Referral code"
        subtitle="If someone signed you up, credit them"
        showCart={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-screen gap-space-4 pb-space-10"
          keyboardShouldPersistTaps="handled"
        >
          <SectionCard title="Enter the code">
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="e.g. BLK-1234"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
              accessibilityLabel="Referral code"
            />
            <Text size="caption" variant="subtle">
              This can only be set once, and it changes nothing about your
              account or your prices.
            </Text>
            <Button
              label="Apply code"
              loading={busy}
              disabled={code.trim().length === 0 || busy}
              onPress={() => void submit()}
            />
            {outcome ? (
              <Text size="sm" variant={failed ? "destructive" : "muted"}>
                {outcome}
              </Text>
            ) : null}
          </SectionCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
