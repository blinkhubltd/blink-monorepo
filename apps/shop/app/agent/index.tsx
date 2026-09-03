import { useState } from "react";
import { Platform, Pressable, ScrollView, Share, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Copy, QrCode, TrendingUp, Users, Wallet } from "lucide-react-native";
import QRCodeSvg from "react-native-qrcode-svg";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../components/screen-header";
import { SectionCard } from "../../components/checkout/sections";
import { formatKES } from "../../lib/format";
import {
  describePayoutStatus,
  payoutRequestProblem,
  playStoreInstallLink,
  referralDeepLink,
} from "../../lib/agent";

/**
 * The agent dashboard. URL `/agent`.
 *
 * ── The backend behind this was printing money ───────────────────────────
 *
 * `incrementInstallCount` and `incrementRegistrationCount` were public,
 * unauthenticated mutations that credited an agent's balance, keyed on the
 * referral code printed on the agent's own poster. Anyone who could read a poster
 * could mint earnings in a loop, withdrawable through the Paystack payout path.
 * They are internal now, and registration is credited once per real account
 * through `attributeMyRegistration`.
 *
 * ── What this screen never receives ──────────────────────────────────────
 *
 * The Paystack recipient code and the M-Pesa number. `getMyAgentSummary` reports
 * whether payouts are enabled, not where the money goes — the old dashboard was
 * given the recipient code, which is a payout destination held on a device.
 *
 * ── Available balance is not balance ─────────────────────────────────────
 *
 * Money in an open request is spoken for. Showing the raw balance as spendable is
 * how an agent requests the same money twice and reads the refusal as a bug, so
 * both figures are shown with the difference named.
 */
export default function AgentDashboardScreen() {
  const { isLoaded, isSignedIn } = useAuth();

  const summary = useQuery(
    api.data.marketing.getMyAgentSummary,
    isSignedIn ? {} : "skip",
  );
  const earnings = useQuery(
    api.data.marketing.getMyAgentEarnings,
    isSignedIn ? { limit: 20 } : "skip",
  );
  const requests = useQuery(
    api.data.agent_payment_requests.getMyPayoutRequests,
    isSignedIn ? { limit: 10 } : "skip",
  );
  const requestPayout = useMutation(
    api.data.agent_payment_requests.requestMyPayout,
  );

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoaded && !isSignedIn) {
    return (
      <Gate
        title="Sign in first"
        body="Agent earnings are tied to your account."
        action={{
          label: "Sign in",
          onPress: () => router.push("/(auth)/sign-in"),
        }}
      />
    );
  }

  if (summary === undefined) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Agent" showCart={false} />
        <View className="px-screen gap-space-3">
          <Skeleton className="h-[80px] w-full rounded-lg" />
          <Skeleton className="h-[120px] w-full rounded-lg" />
        </View>
      </SafeAreaView>
    );
  }

  // Not an agent. Most customers are not, so this is an explanation and not an
  // error — and it deliberately does not offer to sign anyone up, because
  // becoming an agent is an admin action with a zone and a commission attached.
  if (summary === null) {
    return (
      <Gate
        title="You are not an agent"
        body="The agent programme is by arrangement. If you have been onboarded and this persists, contact your zone lead."
        action={{ label: "Back", onPress: () => router.back() }}
      />
    );
  }

  const requested = Number(amount.replace(/[^\d.]/g, ""));
  // The same rules the server applies, so the button explains itself rather
  // than the request failing. The payout-DAY rule is deliberately not mirrored:
  // it depends on a setting this screen does not read, and a client copy of it
  // would be the one that goes stale.
  const problem = payoutRequestProblem({
    amount: requested,
    available: summary.availableBalance,
    payoutsEnabled: summary.payoutsEnabled,
    hasPendingRequest: summary.hasPendingRequest,
  });
  const amountValid = problem === null;

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestPayout({ amount: requested });
      setNotice("Payout requested. You will be paid once it is approved.");
      setAmount("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not request that payout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Agent"
        title={summary.zone?.name ?? "Your referrals"}
        subtitle={`Code ${summary.code}`}
        showCart={false}
      />

      <ScrollView contentContainerClassName="px-screen gap-space-4 pb-space-10">
        {/* Balance first: it is what the screen is opened for. */}
        <View className="border-hairline border-border bg-card gap-space-3 p-space-4 rounded-lg">
          <View className="gap-space-1">
            <Text size="caption" variant="eyebrow">
              Available to withdraw
            </Text>
            <Text variant="price" size="priceLg">
              {formatKES(summary.availableBalance)}
            </Text>
          </View>

          {/*
            The difference, named. Showing only the raw balance is how an agent
            requests the same money twice.
          */}
          {summary.requestedAmount > 0 ? (
            <Text size="caption" variant="subtle">
              {formatKES(summary.balance)} earned and unpaid, of which{" "}
              {formatKES(summary.requestedAmount)} is in an open request.
            </Text>
          ) : null}

          <Separator />

          <View className="gap-space-2 flex-row">
            <Stat
              icon={<TrendingUp size={16} color="#5A6372" />}
              label="Earned"
              value={formatKES(summary.totalEarned)}
            />
            <Stat
              icon={<Wallet size={16} color="#5A6372" />}
              label="Paid out"
              value={formatKES(summary.totalPaid)}
            />
          </View>

          <View className="gap-space-2 flex-row">
            <Stat
              icon={<Users size={16} color="#5A6372" />}
              label="Registrations"
              value={String(summary.registrations)}
            />
            <Stat
              icon={<QrCode size={16} color="#5A6372" />}
              label="Scans"
              value={String(summary.scans)}
            />
          </View>
        </View>

        {/* The referral code, and the one useful thing to do with it. */}
        <SectionCard title="Your referral code">
          <View className="bg-muted p-space-4 items-center rounded-md">
            <Text size="h2" weight="black">
              {summary.code}
            </Text>
          </View>

          {/*
            Scanning this opens the app straight to /referral with the code
            already filled in — see lib/agent.ts's referralDeepLink for why
            it's a blink:// link and not a website URL.
          */}
          <View className="bg-card border-hairline border-border items-center gap-space-2 rounded-md p-space-4">
            <QRCodeSvg value={referralDeepLink(summary.code)} size={160} />
            <Text size="caption" variant="subtle" className="text-center">
              Only works for someone who already has the app installed.
            </Text>
          </View>

          <View className="gap-space-2 flex-row">
            <Button
              size="sm"
              variant="outline"
              label="Share"
              icon={<Copy size={16} color="#0A0E16" />}
              onPress={() => {
                void Share.share({
                  message: `Shop on Blink and use my code ${summary.code} when you sign up: ${referralDeepLink(summary.code)}`,
                });
              }}
            />
          </View>
          <Text size="caption" variant="subtle">
            A registration is credited once, when a new customer signs up and
            enters this code.
          </Text>
        </SectionCard>

        {/*
          Install credit, Android only. The link carries the code through the
          Play Store's own referrer mechanism, so it works before the app is
          even installed — the deep link above only works for someone who
          already has it. See lib/agent.ts's playStoreInstallLink and
          lib/install-attribution.ts for how the code makes it back.
        */}
        {Platform.OS === "android" ? (
          <SectionCard title="Install link (Android)">
            <View className="bg-card border-hairline border-border items-center gap-space-2 rounded-md p-space-4">
              <QRCodeSvg value={playStoreInstallLink(summary.code)} size={160} />
            </View>
            <Button
              size="sm"
              variant="outline"
              label="Share install link"
              icon={<Copy size={16} color="#0A0E16" />}
              onPress={() => {
                void Share.share({
                  message: `Get Blink and I'll be credited when you install it: ${playStoreInstallLink(summary.code)}`,
                });
              }}
            />
            <Text size="caption" variant="subtle">
              Credited once per new install, the first time it opens signed
              in. No equivalent exists on iOS.
            </Text>
          </SectionCard>
        ) : null}

        {/* How this agent is paid, from the zone. */}
        {summary.zone ? (
          <SectionCard title="How you earn">
            <Text size="sm" variant="muted">
              {describeZone(summary.zone)}
            </Text>
          </SectionCard>
        ) : null}

        <SectionCard title="Request a payout">
          {!summary.payoutsEnabled ? (
            <Text size="sm" variant="muted">
              Payouts are not enabled on your account yet. Your zone lead sets
              this up — no bank details are stored on this device.
            </Text>
          ) : summary.hasPendingRequest ? (
            <Text size="sm" variant="muted">
              You have a request awaiting approval. One at a time, so amounts
              cannot be double-counted.
            </Text>
          ) : summary.availableBalance <= 0 ? (
            <Text size="sm" variant="muted">
              Nothing available to withdraw yet.
            </Text>
          ) : (
            <>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder={`Up to ${formatKES(summary.availableBalance)}`}
                keyboardType="numeric"
                accessibilityLabel="Payout amount"
              />
              {amount.length > 0 && problem ? (
                <Text size="caption" variant="destructive">
                  {problem}
                </Text>
              ) : null}
              <Button
                label="Request payout"
                loading={busy}
                disabled={!amountValid || busy}
                onPress={() => void submit()}
              />
              <Text size="caption" variant="subtle">
                Payouts can only be requested on the days your zone allows, and
                the server checks that — not this screen.
              </Text>
            </>
          )}

          {notice ? (
            <Text size="sm" variant="muted">
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text size="sm" variant="destructive">
              {error}
            </Text>
          ) : null}
        </SectionCard>

        <SectionCard title="Payout history">
          {requests === undefined ? (
            <Skeleton className="h-[40px] w-full rounded-sm" />
          ) : requests.length === 0 ? (
            <Text size="sm" variant="muted">
              No payouts requested yet.
            </Text>
          ) : (
            requests.map((request, index) => {
              const status = describePayoutStatus(request.status);
              return (
                <View key={request._id} className="gap-space-2">
                  {index > 0 ? <Separator /> : null}
                  <View className="gap-space-2 flex-row items-center">
                    <View className="gap-space-1 flex-1">
                      <Text size="sm" weight="medium">
                        {formatKES(request.amount)}
                      </Text>
                      <Text size="caption" variant="subtle">
                        {new Date(request.requested_at).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </Text>
                      {/*
                        Shown, because a rejection with no reason is a support
                        call. The admin records one; the agent never saw it.
                      */}
                      {request.rejection_reason ? (
                        <Text size="caption" variant="destructive">
                          {request.rejection_reason}
                        </Text>
                      ) : null}
                    </View>
                    <Badge variant={status.variant} label={status.label} />
                  </View>
                </View>
              );
            })
          )}
        </SectionCard>

        <SectionCard title="Recent earnings">
          {earnings === undefined ? (
            <Skeleton className="h-[40px] w-full rounded-sm" />
          ) : earnings.length === 0 ? (
            <Text size="sm" variant="muted">
              Nothing credited yet.
            </Text>
          ) : (
            <>
              {earnings.map((earning, index) => (
                <View key={earning._id} className="gap-space-2">
                  {index > 0 ? <Separator /> : null}
                  <View className="flex-row items-baseline justify-between">
                    <View className="gap-space-1">
                      <Text size="sm">{earningLabel(earning.type)}</Text>
                      <Text size="caption" variant="subtle">
                        {new Date(earning.created_at).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" },
                        )}
                      </Text>
                    </View>
                    <Text size="sm" weight="semibold">
                      {formatKES(earning.amount)}
                    </Text>
                  </View>
                </View>
              ))}
              {!summary.earningsCountIsExact ? (
                <Text size="caption" variant="subtle">
                  {summary.earningsCount}+ credits in total.
                </Text>
              ) : null}
            </>
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="bg-muted gap-space-1 p-space-3 flex-1 rounded-md">
      <View className="gap-space-1 flex-row items-center">
        {icon}
        <Text size="caption" variant="subtle">
          {label}
        </Text>
      </View>
      <Text size="sm" weight="semibold">
        {value}
      </Text>
    </View>
  );
}

function earningLabel(type: string): string {
  if (type === "install") return "App install";
  if (type === "registration") return "Customer registration";
  if (type === "fixed") return "Fixed period payment";
  // Named rather than swallowed: a new earning type should read as itself.
  return type;
}

/**
 * The zone's commission rules, in a sentence.
 *
 * Worth stating on the agent's own screen: `creditAgentEarning` pays per-unit
 * rates only ABOVE the zone minimum when the type is "both", which is not
 * something an agent would infer from a number alone.
 */
function describeZone(zone: {
  earningType: string;
  installRate: number | null;
  registrationRate: number | null;
  fixedAmount: number | null;
  minInstalls: number | null;
  minRegistrations: number | null;
}): string {
  const parts: string[] = [];

  if (zone.registrationRate) {
    parts.push(`${formatKES(zone.registrationRate)} per registration`);
  }
  if (zone.installRate) {
    parts.push(`${formatKES(zone.installRate)} per install`);
  }
  if (zone.fixedAmount) {
    parts.push(`${formatKES(zone.fixedAmount)} fixed`);
  }

  const base =
    parts.length > 0 ? parts.join(", ") : "Your zone has no rates set yet.";

  if (
    zone.earningType === "both" &&
    ((zone.minInstalls ?? 0) > 0 || (zone.minRegistrations ?? 0) > 0)
  ) {
    return `${base}. The fixed amount covers up to ${zone.minRegistrations ?? 0} registrations and ${zone.minInstalls ?? 0} installs; per-unit rates apply beyond that.`;
  }

  return base;
}

function Gate({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Agent" showCart={false} />
      <View className="gap-space-4 px-screen py-space-8 items-center">
        <Text size="lg" weight="semibold" className="text-center">
          {title}
        </Text>
        <Text variant="muted" size="sm" className="text-center">
          {body}
        </Text>
        {action ? (
          <Button label={action.label} onPress={action.onPress} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
