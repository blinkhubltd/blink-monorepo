import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { BarChart } from "../../components/BarChart";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Stat } from "../../components/Stat";
import { formatMoneyCompact } from "../../lib/format";
import {
  buildChart,
  bucketTarget,
  clampTarget,
  DEFAULT_INCENTIVE_RATES,
  periodPlan,
  progressPct,
  projectEarnings,
  summariseWeek,
  trendVsPlan,
  type Bucket,
  type IncentivePeriod,
} from "../../lib/incentives";

const PERIOD_TABS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const satisfies readonly { value: IncentivePeriod; label: string }[];

/** Fixture buckets, replaced by an aggregate query per the backend plan. */
const BUCKETS: Record<IncentivePeriod, Bucket[]> = {
  daily: [
    { label: "8am", value: 1 },
    { label: "10am", value: 2 },
    { label: "12pm", value: 1 },
    { label: "2pm", value: 2 },
    { label: "4pm", value: 1 },
    { label: "6pm", value: 1 },
  ],
  weekly: [
    { label: "Mon", value: 11 },
    { label: "Tue", value: 14 },
    { label: "Wed", value: 9 },
    { label: "Thu", value: 13 },
    { label: "Fri", value: 15 },
    { label: "Sat", value: 16 },
    { label: "Sun", value: 8 },
  ],
  monthly: [
    { label: "Wk 1", value: 78 },
    { label: "Wk 2", value: 84 },
    { label: "Wk 3", value: 91 },
    { label: "Wk 4", value: 86 },
  ],
};

const DELIVERIES_TODAY = 8;
const PEAK_HOUR_BONUS = 320;
const REFERRAL_BONUS = 0;
const ON_TIME_RATE = "96%";

export default function IncentivesRoute() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<IncentivePeriod>("daily");
  const [targetText, setTargetText] = useState("12");

  const target = clampTarget(Number(targetText));
  const rates = DEFAULT_INCENTIVE_RATES;

  const model = useMemo(() => {
    const buckets = BUCKETS[period];
    const chart = buildChart(
      buckets,
      bucketTarget(period, target, buckets.length, rates),
    );
    const total = buckets.reduce((sum, b) => sum + b.value, 0);
    return { chart, trend: trendVsPlan(total, periodPlan(period, target)) };
  }, [period, target, rates]);

  const projection = projectEarnings(target, rates);

  const week = useMemo(() => {
    const deliveries = BUCKETS.weekly.reduce((sum, b) => sum + b.value, 0);
    const summary = summariseWeek({
      deliveries,
      daysWorked: rates.workingDaysPerWeek,
      peakHourBonus: PEAK_HOUR_BONUS,
      referralBonus: REFERRAL_BONUS,
      rates,
    });
    const best = BUCKETS.weekly.reduce((a, b) => (b.value > a.value ? b : a));
    return { deliveries, summary, best };
  }, [rates]);

  const todayBonus = DELIVERIES_TODAY * rates.bonusPerDelivery;

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-space-5 pb-space-7"
      >
        <View className="gap-space-1">
          <Text variant="heading" size="h3">
            Performance
          </Text>
          <Text variant="muted" size="sm">
            Today&rsquo;s progress, your plan, and what you&rsquo;re earning.
          </Text>
        </View>

        {/* Today — ink card */}
        <Card className="gap-space-3 border-ink-950 bg-ink-950">
          <View className="flex-row items-center justify-between">
            <Text weight="bold" size="sm" variant="onInverse">
              Today&rsquo;s progress
            </Text>
            <Badge
              variant="warning"
              label={`Est. ${formatMoneyCompact(todayBonus)}`}
            />
          </View>
          <ProgressBar
            onInverse
            pct={progressPct(DELIVERIES_TODAY, target)}
          />
          <Text size="label" weight="medium" className="text-ink-400">
            {DELIVERIES_TODAY} of {target} deliveries
          </Text>
        </Card>

        {/* Chart */}
        <Card className="gap-space-5">
          <View className="flex-row items-center justify-between">
            <Text variant="heading" size="h4">
              Progress overview
            </Text>
            <Badge
              variant={model.trend.tone === "success" ? "success" : "warning"}
              label={model.trend.label}
            />
          </View>
          <SegmentedTabs
            items={PERIOD_TABS}
            value={period}
            onChange={setPeriod}
          />
          <BarChart
            bars={model.chart.bars}
            targetLinePct={model.chart.targetLinePct}
          />
          <Text variant="muted" size="label">
            Dashed line marks your plan.
          </Text>
        </Card>

        {/* Target */}
        <Card className="gap-space-4">
          <Text variant="heading" size="h4">
            Set your target
          </Text>
          <View className="flex-row items-center gap-space-4">
            <Input
              containerClassName="w-[96px]"
              value={targetText}
              onChangeText={(t) => setTargetText(t.replace(/\D/g, ""))}
              onBlur={() => setTargetText(String(target))}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Daily delivery target"
            />
            <Text variant="muted" size="sm">
              deliveries per day
            </Text>
          </View>
          <View className="gap-space-1 rounded-md bg-secondary p-space-4">
            <View className="flex-row items-center justify-between">
              <Text size="sm" weight="medium" className="flex-1 pr-space-3">
                Base pay + bonus (Ksh {rates.bonusPerDelivery}/delivery)
              </Text>
              <Text weight="bold" size="sm" className="text-strong">
                {formatMoneyCompact(projection.perDay)}/day
              </Text>
            </View>
            <Text variant="subtle" size="label">
              ~{formatMoneyCompact(projection.perWeek)}/week across a{" "}
              {rates.workingDaysPerWeek}-day week
            </Text>
          </View>
        </Card>

        {/* Summary tiles */}
        <Text variant="heading" size="h4">
          Earnings summary
        </Text>
        <View className="gap-space-4">
          <View className="flex-row gap-space-4">
            <Card className="flex-1">
              <Stat
                label="This week"
                value={formatMoneyCompact(week.summary.total)}
              />
            </Card>
            <Card className="flex-1">
              <Stat
                label="Avg / delivery"
                value={
                  week.summary.averagePerDelivery === null
                    ? "—"
                    : formatMoneyCompact(week.summary.averagePerDelivery)
                }
              />
            </Card>
          </View>
          <View className="flex-row gap-space-4">
            <Card className="flex-1">
              <Stat
                label="Best day"
                value={week.best.label}
                unit={`${week.best.value}`}
              />
            </Card>
            <Card className="flex-1">
              <Stat label="On-time rate" value={ON_TIME_RATE} />
            </Card>
          </View>
        </View>

        {/* Breakdown */}
        <Card className="gap-space-3">
          {week.summary.lines.map((line) => (
            <View
              key={line.label}
              className="flex-row items-center justify-between"
            >
              <Text variant="muted" size="sm" className="flex-1 pr-space-3">
                {line.label}
              </Text>
              <Text size="sm" weight="semibold">
                {formatMoneyCompact(line.amount)}
              </Text>
            </View>
          ))}
          <Separator />
          <View className="flex-row items-center justify-between">
            <Text weight="bold" className="text-strong">
              Total earned
            </Text>
            <Text variant="price" size="price">
              {formatMoneyCompact(week.summary.total)}
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
