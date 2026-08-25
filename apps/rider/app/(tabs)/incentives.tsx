import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Input } from "@repo/mobile-ui/components/ui/input";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { BarChart } from "../../components/BarChart";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Stat } from "../../components/Stat";
import { formatMoneyCompact } from "../../lib/format";
import {
  useCompletedDeliveries,
  useIncentiveDashboard,
  useSetDailyTarget,
} from "../../lib/data";
import { bucketsFor } from "../../lib/data/buckets";
import { useCrewRole } from "../../providers/CrewProvider";
import {
  buildChart,
  bucketTarget,
  clampTarget,
  periodPlan,
  progressPct,
  trendVsPlan,
  type IncentivePeriod,
} from "../../lib/incentives";

const PERIOD_TABS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const satisfies readonly { value: IncentivePeriod; label: string }[];

/** Used only until a hub publishes a threshold or the crew member sets one. */
const DEFAULT_TARGET = 12;

export default function IncentivesRoute() {
  const insets = useSafeAreaInsets();
  const role = useCrewRole();
  const dashboard = useIncentiveDashboard();
  const completed = useCompletedDeliveries();
  const setDailyTarget = useSetDailyTarget();

  const [period, setPeriod] = useState<IncentivePeriod>("daily");
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `now` is captured once per render and threaded through, so every derived
  // number on the screen agrees on what "today" means.
  const now = Date.now();

  // getIncentiveDashboard falls back to 0 when the crew member has neither a
  // saved target nor a hub config, so 0 means "unset", not "a target of zero".
  const savedTarget = dashboard?.targets?.daily
    ? dashboard.targets.daily
    : null;
  const target = clampTarget(
    targetDraft !== null ? Number(targetDraft) : (savedTarget ?? DEFAULT_TARGET),
  );

  const chart = useMemo(() => {
    if (completed === undefined) return undefined;
    const buckets = bucketsFor(period, completed, now);
    const model = buildChart(
      buckets,
      bucketTarget(period, target, buckets.length),
    );
    const total = buckets.reduce((sum, b) => sum + b.value, 0);
    return { ...model, trend: trendVsPlan(total, periodPlan(period, target)) };
  }, [completed, period, target, now]);

  async function commitTarget(value: string) {
    const next = clampTarget(Number(value));
    setTargetDraft(String(next));
    setSaving(true);
    try {
      await setDailyTarget(next);
    } finally {
      setSaving(false);
    }
  }

  if (dashboard === undefined) {
    return (
      <Screen withTabBar>
        <View
          style={{ paddingTop: insets.top + 12 }}
          className="gap-space-5 pb-space-7"
        >
          <Skeleton className="h-space-8 w-[180px]" />
          <Card className="h-[100px]" />
          <Card className="h-[260px]" />
          <Card className="h-[170px]" />
        </View>
      </Screen>
    );
  }

  const doneToday = dashboard.counts.daily;
  const config = dashboard.config;
  const base = dashboard.baseEarnings;
  const bonus = dashboard.bonus;

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
            {bonus.bonus > 0 ? (
              <Badge
                variant="warning"
                label={`Est. ${formatMoneyCompact(bonus.bonus)}`}
              />
            ) : null}
          </View>
          <ProgressBar onInverse pct={progressPct(doneToday, target)} />
          <Text size="label" weight="medium" className="text-ink-400">
            {doneToday} of {target}{" "}
            {role === "rider" ? "deliveries" : "orders"}
          </Text>
        </Card>

        {/* Chart */}
        <Card className="gap-space-5">
          <View className="flex-row items-center justify-between">
            <Text variant="heading" size="h4">
              Progress overview
            </Text>
            {chart ? (
              <Badge
                variant={chart.trend.tone === "success" ? "success" : "warning"}
                label={chart.trend.label}
              />
            ) : null}
          </View>
          <SegmentedTabs
            items={PERIOD_TABS}
            value={period}
            onChange={setPeriod}
          />
          {chart === undefined ? (
            <Skeleton className="h-[120px]" />
          ) : (
            <BarChart bars={chart.bars} targetLinePct={chart.targetLinePct} />
          )}
          <Text variant="muted" size="label">
            {role === "rider"
              ? "Dashed line marks your plan. Counts completed deliveries."
              : "Dashed line marks your plan."}
          </Text>
          {/*
            Riders only: the buckets are derived from the rider's own shipment
            list because no backend query returns a time series. A picker has no
            equivalent list, so there is nothing to bucket.
          */}
          {role !== "rider" ? (
            <Text variant="subtle" size="caption">
              A per-period breakdown isn&rsquo;t available for pickers yet.
            </Text>
          ) : null}
        </Card>

        {/* Target */}
        <Card className="gap-space-4">
          <Text variant="heading" size="h4">
            Set your target
          </Text>
          <View className="flex-row items-center gap-space-4">
            <Input
              containerClassName="w-[96px]"
              value={targetDraft ?? String(target)}
              onChangeText={(t) => setTargetDraft(t.replace(/\D/g, ""))}
              onBlur={() => void commitTarget(targetDraft ?? String(target))}
              keyboardType="number-pad"
              maxLength={2}
              editable={!saving}
              accessibilityLabel="Daily target"
            />
            <Text variant="muted" size="sm">
              {role === "rider" ? "deliveries" : "orders"} per day
            </Text>
          </View>

          {config ? (
            <View className="gap-space-1 rounded-md bg-secondary p-space-4">
              <View className="flex-row items-center justify-between">
                <Text size="sm" weight="medium" className="flex-1 pr-space-3">
                  Bonus above {config.threshold_daily}/day
                </Text>
                <Text weight="bold" size="sm" className="text-strong">
                  {formatMoneyCompact(config.bonus_per_extra_daily)} each
                </Text>
              </View>
              {base ? (
                <Text variant="subtle" size="label">
                  Base {formatMoneyCompact(base.monthly_base_amount)} per month
                </Text>
              ) : null}
            </View>
          ) : (
            // The projection the design shows needs a rate and a base. Both come
            // from `incentives` config rows that a hub has to create; inventing
            // "Ksh 45/delivery" would show every crew member a number that is
            // not their deal.
            <Text variant="muted" size="sm">
              Your hub hasn&rsquo;t published bonus rates yet, so earnings
              can&rsquo;t be projected.
            </Text>
          )}
        </Card>

        {/* Summary */}
        <Text variant="heading" size="h4">
          Summary
        </Text>
        <View className="gap-space-4">
          <View className="flex-row gap-space-4">
            <Card className="flex-1">
              <Stat
                label="This week"
                value={String(dashboard.counts.weekly)}
                unit={role === "rider" ? "deliveries" : "orders"}
              />
            </Card>
            <Card className="flex-1">
              <Stat
                label="This month"
                value={String(dashboard.counts.monthly)}
              />
            </Card>
          </View>
          <View className="flex-row gap-space-4">
            <Card className="flex-1">
              <Stat
                label="Daily average"
                value={dashboard.advanced.dailyAverage.toFixed(1)}
              />
            </Card>
            <Card className="flex-1">
              <Stat
                label="Projected month"
                value={String(Math.round(dashboard.advanced.projectedMonthly))}
              />
            </Card>
          </View>
        </View>

        {/* Earnings */}
        {base || bonus.bonus > 0 ? (
          <Card className="gap-space-3">
            {base ? (
              <View className="flex-row items-center justify-between">
                <Text variant="muted" size="sm" className="flex-1 pr-space-3">
                  Monthly base
                </Text>
                <Text size="sm" weight="semibold">
                  {formatMoneyCompact(base.monthly_base_amount)}
                </Text>
              </View>
            ) : null}
            <View className="flex-row items-center justify-between">
              <Text variant="muted" size="sm" className="flex-1 pr-space-3">
                Bonus ({bonus.extraTasks} above target)
              </Text>
              <Text size="sm" weight="semibold">
                {formatMoneyCompact(bonus.bonus)}
              </Text>
            </View>
            <Separator />
            <View className="flex-row items-center justify-between">
              <Text weight="bold" className="text-strong">
                Projected total
              </Text>
              <Text variant="price" size="price">
                {formatMoneyCompact(
                  (base?.monthly_base_amount ?? 0) + bonus.bonus,
                )}
              </Text>
            </View>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
