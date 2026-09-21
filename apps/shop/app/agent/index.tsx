import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Share, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Icon } from "../../components/icon";
import QRCodeSvg from "react-native-qrcode-svg";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../components/screen-header";
import { SectionCard } from "../../components/checkout/sections";
import { formatKES } from "../../lib/format";
import { referralPosterHtml } from "../../lib/agent-poster";
import { useToast } from "../../providers/ToastProvider";
import {
  describeEarningRange,
  describePayoutStatus,
  EARNING_RANGES,
  filterEarningsByRange,
  payoutDayProblem,
  payoutRequestProblem,
  playStoreInstallLink,
  referralDeepLink,
  type EarningRange,
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
  const { user } = useUser();

  const summary = useQuery(
    api.data.marketing.getMyAgentSummary,
    isSignedIn ? {} : "skip",
  );
  const earnings = useQuery(
    api.data.marketing.getMyAgentEarnings,
    isSignedIn ? { limit: 50 } : "skip",
  );
  const requests = useQuery(
    api.data.agent_payment_requests.getMyPayoutRequests,
    isSignedIn ? { limit: 10 } : "skip",
  );
  const requestPayout = useMutation(
    api.data.agent_payment_requests.requestMyPayout,
  );
  // The same row `requestMyPayout` reads before it refuses. Public, and not
  // agent-specific, so it is safe to read here and costs one cached query.
  const payoutDays = useQuery(api.data.platform_settings.get, {
    key: "agent_payout_days",
  });

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [range, setRange] = useState<EarningRange>("all");
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  // The QR rendered for PRINT, not for screen: 512px so the PDF is crisp,
  // and off-screen because it is an export source rather than something to
  // look at. `react-native-qrcode-svg` hands back a base64 PNG through this
  // ref, which is the only way to get the drawn code into HTML.
  const posterQr = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(
    null,
  );

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
        <ScreenHeader title="Agent" />
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
  // `undefined` while the setting loads: treated as no restriction, so the
  // form does not flash a refusal before the answer arrives.
  const dayProblem = payoutDayProblem(payoutDays?.value);
  const visibleEarnings = filterEarningsByRange(earnings ?? [], range);

  /**
   * Render the poster to a PDF and hand it to the OS share sheet.
   *
   * Sharing rather than silently writing a file: `printToFileAsync` puts the
   * PDF in the app's cache directory, which the customer has no way to
   * browse. The share sheet is what actually gets it onto a printer, into
   * WhatsApp, or saved to Files.
   */
  async function exportPoster() {
    if (!summary) return;
    setExporting(true);
    try {
      const qrDataUrl = await new Promise<string>((resolve, reject) => {
        const ref = posterQr.current;
        if (!ref) {
          reject(new Error("The poster QR has not rendered yet."));
          return;
        }
        // Callback-style, and it can simply never fire if the SVG has not
        // painted — so this races a timeout rather than leaving the button
        // spinning forever.
        const timer = setTimeout(
          () => reject(new Error("Timed out drawing the QR code.")),
          5000,
        );
        ref.toDataURL((data: string) => {
          clearTimeout(timer);
          resolve(`data:image/png;base64,${data}`);
        });
      });

      const { uri } = await Print.printToFileAsync({
        html: referralPosterHtml({
          qrDataUrl,
          agentCode: summary.code,
          // The person, from Clerk — `getMyAgentSummary` deliberately
          // returns the zone and the code, not an identity.
          agentName: user?.fullName ?? user?.firstName ?? undefined,
        }),
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Blink referral poster — ${summary.code}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        // Rare (a device with no share targets at all), but silently doing
        // nothing would read as a broken button.
        toast("Poster saved to this app's files.");
      }
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Could not make the poster.",
        "destructive",
      );
    } finally {
      setExporting(false);
    }
  }

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
              icon={<Icon name="trending-up" size={16} tone="body" />}
              label="Earned"
              value={formatKES(summary.totalEarned)}
            />
            <Stat
              icon={<Icon name="wallet-outline" size={16} tone="body" />}
              label="Paid out"
              value={formatKES(summary.totalPaid)}
            />
          </View>

        </View>

        {/*
          The funnel, ported from the dashboard this replaces — the part of it
          that told an agent something they could act on. Scans, installs and
          sign-ups were three separate counters there; as a funnel they answer
          the question an agent actually has, which is where people drop out.

          This also fixes an omission: installs appeared nowhere on this
          screen at all. The two activity tiles that used to sit above were
          folded in here rather than kept alongside — the same numbers twice,
          in two shapes, is not two pieces of information.
        */}
        <SectionCard title="Your funnel">
          {summary.scans === 0 &&
          summary.installs === 0 &&
          summary.registrations === 0 ? (
            <Text size="sm" variant="muted">
              Nothing yet. Every scan of your code shows up here, along with
              how many of those turned into installs and sign-ups.
            </Text>
          ) : (
            <>
              <FunnelBar
                label="QR scans"
                value={summary.scans}
                max={summary.scans}
              />
              <FunnelBar
                label="App installs"
                value={summary.installs}
                max={summary.scans}
              />
              <FunnelBar
                label="Sign-ups"
                value={summary.registrations}
                max={summary.scans}
              />

              <Separator />

              <View className="gap-space-2 flex-row">
                <Stat
                  icon={<Icon name="download-outline" size={16} tone="body" />}
                  label="Scan → install"
                  value={ratio(summary.installs, summary.scans)}
                />
                <Stat
                  icon={
                    <Icon name="person-add-outline" size={16} tone="body" />
                  }
                  label="Install → sign-up"
                  value={ratio(summary.registrations, summary.installs)}
                />
              </View>
            </>
          )}
        </SectionCard>

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
              icon={<Icon name="copy-outline" size={16} tone="strong" />}
              onPress={() => {
                void Share.share({
                  message: `Shop on Blink and use my code ${summary.code} when you sign up: ${referralDeepLink(summary.code)}`,
                });
              }}
            />
            <Button
              size="sm"
              variant="outline"
              label="Poster (PDF)"
              loading={exporting}
              disabled={exporting}
              icon={<Icon name="print-outline" size={16} tone="strong" />}
              onPress={() => void exportPoster()}
            />
          </View>

          {/*
            The print source. Off-screen rather than hidden with `display`
            or zero opacity: the SVG has to actually lay out for
            `toDataURL` to have anything to encode. 512px so the code stays
            sharp at poster size — the on-screen one above is 160px, which
            prints soft.
          */}
          <View
            pointerEvents="none"
            className="absolute"
            style={{ left: -10000, top: 0 }}
          >
            <QRCodeSvg
              value={playStoreInstallLink(summary.code)}
              size={512}
              getRef={(ref) => {
                posterQr.current = ref as never;
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
              icon={<Icon name="copy-outline" size={16} tone="strong" />}
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
            {/*
              The rates as a list before the sentence, which is how the old
              dashboard showed them: an agent checking what a sign-up is
              worth should not have to parse a paragraph. The sentence stays
              underneath because it carries the part a list cannot — that a
              fixed amount covers a threshold and per-unit rates only start
              above it.
            */}
            {summary.zone.registrationRate ? (
              <Rate
                label="Per sign-up"
                value={formatKES(summary.zone.registrationRate)}
              />
            ) : null}
            {summary.zone.installRate ? (
              <Rate
                label="Per install"
                value={formatKES(summary.zone.installRate)}
              />
            ) : null}
            {summary.zone.fixedAmount ? (
              <Rate
                label="Fixed"
                value={formatKES(summary.zone.fixedAmount)}
              />
            ) : null}

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
          ) : dayProblem ? (
            // Said up front, on the day, rather than after an amount has been
            // typed and the request bounced. Same setting the server reads.
            <Text size="sm" variant="muted">
              {dayProblem}
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
                size="cta"
                full
                loading={busy}
                disabled={!amountValid || busy}
                onPress={() => void submit()}
              />
              {payoutDays?.value ? (
                <Text size="caption" variant="subtle">
                  Payout days: {payoutDays.value}.
                </Text>
              ) : null}
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
          {/*
            The date chips from the old dashboard. They filter what has been
            fetched rather than re-querying: the list is capped, so a narrow
            range is exact while "all" is "the most recent 50" — which the
            footer below says outright rather than implying a complete
            history.
          */}
          {earnings && earnings.length > 0 ? (
            <View className="gap-space-2 flex-row">
              {EARNING_RANGES.map((option) => {
                const active = option === range;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setRange(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`h-control-sm px-space-3 rounded-pill items-center justify-center ${
                      active ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <Text
                      size="label"
                      weight="semibold"
                      variant={active ? "onBrand" : "muted"}
                    >
                      {describeEarningRange(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {earnings === undefined ? (
            <Skeleton className="h-[40px] w-full rounded-sm" />
          ) : earnings.length === 0 ? (
            <Text size="sm" variant="muted">
              Nothing credited yet.
            </Text>
          ) : visibleEarnings.length === 0 ? (
            <Text size="sm" variant="muted">
              Nothing credited in that period.
            </Text>
          ) : (
            <>
              {visibleEarnings.map((earning, index) => (
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
              {range === "all" && !summary.earningsCountIsExact ? (
                <Text size="caption" variant="subtle">
                  Showing the most recent {visibleEarnings.length} of{" "}
                  {summary.earningsCount}+ credits.
                </Text>
              ) : null}
            </>
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One line of a zone's rate card: what it is, and what it pays. */
function Rate({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text size="sm">{label}</Text>
      <Text size="sm" weight="semibold">
        {value}
      </Text>
    </View>
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

/**
 * One stage of the referral funnel: a label, a count, and a bar scaled
 * against the widest stage.
 *
 * Scaled against `max` rather than each bar filling its own track, because
 * the drop between stages IS the information — three full bars would say
 * nothing. `max` is the scan count, the top of the funnel; when a later
 * stage somehow exceeds it (an install attributed without a scan, which the
 * backend does allow) the bar clamps at full rather than overflowing its
 * track.
 */
function FunnelBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const fraction = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View className="gap-space-1">
      <View className="flex-row items-baseline justify-between">
        <Text size="sm">{label}</Text>
        <Text size="sm" weight="semibold">
          {value}
        </Text>
      </View>
      <View className="bg-muted h-[6px] overflow-hidden rounded-pill">
        <View
          className="bg-primary h-full rounded-pill"
          // A percentage width, so the bar is correct at any card width
          // without measuring anything.
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </View>
    </View>
  );
}

/**
 * A conversion rate, or an em dash when the denominator is zero.
 *
 * "0%" would be a claim — that nobody converted — where no scans means the
 * question has not been asked yet. The old dashboard printed "0" for both.
 */
function ratio(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(0)}%`;
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
      <ScreenHeader title="Agent" />
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
