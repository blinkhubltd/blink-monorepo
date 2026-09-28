import { Pressable, TextInput, View } from "react-native";
import { useRef } from "react";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { useIncentiveDashboard, useRiderJobs } from "../../lib/data";
import {
  averageFee,
  earnedBetween,
  startOfMonth,
  startOfWeek,
  targetPlan,
  thisMonthByWeek,
  thisWeekByDay,
  DAY_MS,
  type RiderJob,
} from "../../lib/earnings";
import {
  TARGET_PRESETS,
  parseTarget,
  useWeeklyEarningsTarget,
} from "../../lib/earnings-target";
import { MONTHS, formatMoneyCompact } from "../../lib/format";
import { useTokenColors } from "@repo/mobile-ui/theme/token-colors";

const ksh = (n: number) => Math.round(n).toLocaleString("en-KE");

/**
 * A rider's Incentives, per the design: the hub's bonus, this week's earnings
 * by day, this month's deliveries by week, a weekly earnings goal turned into
 * deliveries a day, and the week and month totals.
 *
 * ── The bonus card is the hub's real bonus, not the design's sample ──────
 *
 * The design shows a "Weekend surge bonus". Blink has no campaigns; what a hub
 * can publish is a monthly bonus — a rate for every delivery past a daily
 * line, counted over the month (`incentive_configs`). The ink card shows
 * exactly that, and says so plainly when a hub has not published one, rather
 * than advertising a surge that is not running.
 */
export function RiderIncentives() {
  const jobs = useRiderJobs();
  const dashboard = useIncentiveDashboard();
  const now = Date.now();

  if (jobs === undefined || dashboard === undefined) {
    return (
      <View className="gap-[14px]">
        <Card className="h-[150px]" />
        <Card className="h-[220px]" />
        <Card className="h-[200px]" />
        <Skeleton className="h-[260px] rounded-lg" />
      </View>
    );
  }

  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  return (
    <View className="gap-[14px]">
      <BonusCard dashboard={dashboard} now={now} />
      <WeekChart jobs={jobs.all} now={now} />
      <TargetCard jobs={jobs.all} now={now} />
      <View className="flex-row gap-space-4">
        <TotalTile
          label="This week"
          value={formatMoneyCompact(
            earnedBetween(jobs.all, weekStart, weekStart + 7 * DAY_MS),
          )}
        />
        <TotalTile
          label="This month"
          value={formatMoneyCompact(
            earnedBetween(jobs.all, monthStart, nextMonth.getTime()),
          )}
        />
      </View>
    </View>
  );
}

type Dashboard = NonNullable<ReturnType<typeof useIncentiveDashboard>>;

function BonusCard({ dashboard, now }: { dashboard: Dashboard; now: number }) {
  const config = dashboard.config;
  const monthly = dashboard.counts.monthly;
  const daysInMonth = dashboard.advanced.daysInMonth;
  const lastDay = new Date(now);
  lastDay.setDate(daysInMonth);

  return (
    // Mode-fixed ink: the gold eyebrow and bar have to read on it at night too.
    <View className="gap-space-4 rounded-lg bg-on-brand-pill p-[18px] dark:border dark:border-border">
      <Text
        size="caption"
        weight="bold"
        className="uppercase tracking-label text-primary"
      >
        {config ? "MONTHLY BONUS" : "BONUS"}
      </Text>
      {config ? (
        (() => {
          const line = config.threshold_daily * daysInMonth;
          const pct = line > 0 ? Math.min(100, (monthly / line) * 100) : 0;
          const extra = dashboard.bonus.extraTasks;
          return (
            <>
              <Text
                weight="bold"
                className="text-[26px] leading-[29px] tracking-h2 text-white"
              >
                {formatMoneyCompact(config.bonus_per_extra_daily)} for every
                delivery past {line}.
              </Text>
              <View className="h-[10px] overflow-hidden rounded-pill bg-white/15">
                <View
                  className="h-full rounded-pill bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </View>
              <View className="flex-row justify-between gap-space-3">
                <Text size="sm" className="text-white/80">
                  {extra > 0
                    ? `${extra} past the line · ${formatMoneyCompact(dashboard.bonus.bonus)}`
                    : `${monthly} of ${line} this month`}
                </Text>
                <Text size="sm" className="text-white/80">
                  Ends {lastDay.getDate()} {MONTHS[lastDay.getMonth()]}
                </Text>
              </View>
            </>
          );
        })()
      ) : (
        <>
          <Text
            weight="bold"
            className="text-[22px] leading-[27px] tracking-h2 text-white"
          >
            No bonus running.
          </Text>
          <Text size="sm" className="text-white/80">
            When your hub publishes one, what it pays and how close you are
            will show here.
          </Text>
        </>
      )}
    </View>
  );
}

/**
 * This week, Sunday to Saturday. The best day is gold with its figure over
 * it; days still to come are empty tracks, so a quiet Thursday morning does
 * not read as a bad Thursday.
 */
function WeekChart({ jobs, now }: { jobs: RiderJob[]; now: number }) {
  const days = thisWeekByDay(jobs, now);
  const total = days.reduce((s, d) => s + d.value, 0);
  const peak = Math.max(0, ...days.map((d) => d.value));

  return (
    <View className="gap-[14px] rounded-lg border border-border bg-card p-space-5">
      <View className="flex-row items-center justify-between">
        <Text size="h4" weight="bold" className="text-strong">
          Weekly earnings
        </Text>
        <Text size="label" variant="subtle">
          {formatMoneyCompact(total)} total
        </Text>
      </View>
      <View className="h-[148px] flex-row items-end gap-space-3">
        {days.map((d) => {
          const isPeak = peak > 0 && d.value === peak;
          const pct = peak > 0 ? Math.round((d.value / peak) * 100) : 0;
          return (
            <View key={d.label} className="h-full flex-1 items-center justify-end gap-[7px] pt-[26px]">
              <View className="relative w-full flex-1 justify-end rounded-pill bg-secondary">
                {isPeak ? (
                  <View
                    className="absolute self-center rounded-pill bg-on-brand-pill px-space-3 py-[3px]"
                    style={{ bottom: `${pct}%`, marginBottom: 6 }}
                  >
                    <Text size="caption" weight="bold" className="text-white">
                      {ksh(d.value)}
                    </Text>
                  </View>
                ) : null}
                {d.value > 0 ? (
                  <View
                    className={cn(
                      "w-full rounded-pill",
                      isPeak ? "bg-primary" : "bg-strong",
                    )}
                    style={{ height: `${pct}%` }}
                  />
                ) : null}
              </View>
              <Text
                size="caption"
                weight={d.isToday ? "bold" : "regular"}
                className={d.isToday ? "text-strong" : "text-subtle"}
              >
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TargetCard({ jobs, now }: { jobs: RiderJob[]; now: number }) {
  const [target, setTarget] = useWeeklyEarningsTarget();
  const input = useRef<TextInput>(null);
  const colors = useTokenColors();
  const plan = targetPlan(target, jobs, now);
  const fee = averageFee(jobs, now);
  const weeks = thisMonthByWeek(jobs, now);
  const tallest = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <>
      {/* This month, in weeks — gold where the week kept the target's pace. */}
      <View className="gap-[14px] rounded-lg border border-border bg-card p-space-5">
        <Text size="h4" weight="bold" className="text-strong">
          Deliveries this month
        </Text>
        <View className="h-[132px] flex-row items-end gap-space-4">
          {weeks.map((w) => {
            const beat = plan.perDay !== null && w.count / w.days >= plan.perDay;
            return (
              <View key={w.label} className="h-full flex-1 items-center justify-end gap-space-3">
                <Text size="sm" weight="bold" className="text-strong">
                  {w.count}
                </Text>
                <View
                  className={cn(
                    "w-full rounded-b-sm rounded-t-md",
                    beat ? "bg-primary" : "bg-border",
                  )}
                  style={{ height: Math.max(6, (w.count / tallest) * 84) }}
                />
                <Text size="label" variant="subtle">
                  {w.label}
                </Text>
              </View>
            );
          })}
        </View>
        <Text size="sm" variant="subtle">
          {plan.perDay !== null
            ? `Gold weeks averaged ${plan.perDay}+ a day — the pace your target needs. Completed deliveries only.`
            : "Counts completed deliveries only."}
        </Text>
      </View>

      <View className="gap-space-4 rounded-lg border border-border bg-card p-space-5">
        <View>
          <Text size="h4" weight="bold" className="text-strong">
            Your earnings target
          </Text>
          <Text size="sm" variant="subtle">
            What you want to take home by Saturday night.
          </Text>
        </View>

        <Pressable
          onPress={() => input.current?.focus()}
          className="h-[54px] flex-row items-center gap-[10px] rounded-md border border-input bg-card px-[14px]"
        >
          <Text size="base" weight="bold" variant="subtle">
            Ksh
          </Text>
          <TextInput
            ref={input}
            value={target > 0 ? ksh(target) : ""}
            onChangeText={(t) => setTarget(parseTarget(t))}
            keyboardType="number-pad"
            accessibilityLabel="Weekly earnings target"
            placeholder="0"
            placeholderTextColor={colors.subtle}
            className="flex-1 font-bold text-[22px] text-strong"
          />
          <Text size="sm" variant="subtle">
            this week
          </Text>
        </Pressable>

        <View className="flex-row gap-space-3">
          {TARGET_PRESETS.map((v) => {
            const on = v === target;
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setTarget(v)}
                className={cn(
                  "h-[38px] flex-1 items-center justify-center rounded-pill border",
                  on ? "border-on-brand-pill bg-on-brand-pill" : "border-border bg-card",
                )}
              >
                <Text size="sm" weight="bold" className={on ? "text-primary" : "text-foreground"}>
                  {ksh(v)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Custom target"
            onPress={() => {
              setTarget(0);
              input.current?.focus();
            }}
            className="h-[38px] flex-1 items-center justify-center rounded-pill border border-dashed border-input bg-card"
          >
            <Text size="sm" weight="bold" className="text-foreground">
              Custom
            </Text>
          </Pressable>
        </View>

        <View className="gap-[10px] rounded-md bg-on-brand-pill p-space-5 dark:border dark:border-border">
          {plan.hit ? (
            <>
              <View className="flex-row items-baseline gap-space-3">
                <Text weight="bold" className="text-[34px] leading-[36px] text-primary">
                  Done
                </Text>
                <Text size="base" weight="bold" className="text-white">
                  target cleared
                </Text>
              </View>
              <Text size="sm" className="text-white/80">
                You&rsquo;ve already passed this target. Raise it or bank the rest.
              </Text>
            </>
          ) : plan.perDay !== null && target > 0 ? (
            <>
              <View className="flex-row items-baseline gap-space-3">
                <Text weight="bold" className="text-[34px] leading-[36px] text-primary">
                  {plan.perDay}
                </Text>
                <Text size="base" weight="bold" className="text-white">
                  {plan.perDay === 1 ? "delivery a day" : "deliveries a day"}
                </Text>
              </View>
              <Text size="sm" className="text-white/80">
                For the {plan.daysLeft === 1 ? "rest of today" : `next ${plan.daysLeft} days (${plan.daysLabel})`}, at your recent Ksh {ksh(fee ?? 0)} a delivery.
              </Text>
            </>
          ) : (
            <Text size="sm" className="text-white/80">
              {target > 0
                ? "Complete a few deliveries and this works out the pace your target needs."
                : "Set a target to see the deliveries a day it takes."}
            </Text>
          )}
        </View>

        <View className="h-[8px] overflow-hidden rounded-pill bg-secondary">
          <View
            className="h-full rounded-pill bg-primary"
            style={{ width: `${plan.pct}%` }}
          />
        </View>
        <View className="flex-row justify-between">
          <Text size="sm" variant="subtle">
            Ksh {ksh(plan.earned)} earned
          </Text>
          <Text size="sm" variant="subtle">
            {plan.hit ? "Target met" : `Ksh ${ksh(plan.remaining)} to go`}
          </Text>
        </View>
      </View>
    </>
  );
}

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-lg border border-border bg-card p-[14px]">
      <Text size="caption" weight="semibold" className="uppercase tracking-label text-subtle">
        {label.toUpperCase()}
      </Text>
      <Text weight="bold" className="mt-space-1 text-[22px] leading-[28px] text-strong">
        {value}
      </Text>
    </View>
  );
}
