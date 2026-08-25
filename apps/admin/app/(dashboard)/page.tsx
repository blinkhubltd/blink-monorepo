"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ChartBarLineIcon,
  Coins01Icon,
  CreditCardIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { compactKES, fullKES } from "./_components/format";
import { StatCard, StatCardSkeleton } from "./_components/stat-card";
import {
  RevenueChart,
  RevenueChartSkeleton,
} from "./_components/revenue-chart";
import {
  StatusBreakdown,
  StatusBreakdownSkeleton,
} from "./_components/status-breakdown";

/**
 * The windows `insights.getSalesAnalytics` accepts, in the order a manager
 * reaches for them.
 */
const RANGES = [
  { value: "today", label: "Today" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
] as const;

type Range = (typeof RANGES)[number]["value"];

/**
 * The overview.
 *
 * This route previously held nothing but a redirect to /insights, so the landing
 * page was a flash of a spinner and a jump. It is now the summary a manager
 * actually opens the dashboard for: what came in, how it compares to last
 * period, the shape of the trend, and what is stuck.
 *
 * Deliberately built from two queries rather than six. insights.ts does
 * unindexed full-table scans — the plan counted 33 — so every widget added here
 * costs a full pass over orders. `getGrowthMetrics` and `getSalesAnalytics`
 * between them answer the questions above; a third query would have to earn it.
 */
export default function OverviewPage() {
  const [range, setRange] = useState<Range>("thisMonth");
  const { isLoading: permissionsLoading, isAdminUser, can } =
    useCurrentUserPermissions();

  const canSeeInsights = isAdminUser || can("insights:READ");

  const growth = useQuery(
    api.data.insights.getGrowthMetrics,
    canSeeInsights ? {} : "skip",
  );
  const sales = useQuery(
    api.data.insights.getSalesAnalytics,
    canSeeInsights ? { timeRange: range } : "skip",
  );

  // Someone with no insights permission still lands here — the rail sends every
  // signed-in user to "/". Showing an empty dashboard would read as broken, so
  // say plainly that there is nothing for them rather than nothing at all.
  if (!permissionsLoading && !canSeeInsights) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Nothing to show here</CardTitle>
          <CardDescription>
            Your role does not include the insights module. Use the sidebar to
            reach the modules you do have access to.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const loading = permissionsLoading || growth === undefined || sales === undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">
            How the platform is trading, and what needs attention.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={range}
            onValueChange={(v) => setRange(v as Range)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button asChild variant="outline">
            <Link href="/insights">
              Full insights
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            {/*
              The KPI row compares against the PREVIOUS MONTH, from
              getGrowthMetrics — which is a fixed window and does not follow the
              selector above. Labelled "this month" so the two are not confused;
              the selector drives the chart and the status mix below.
            */}
            <StatCard
              label="Revenue this month"
              value={compactKES(growth.revenue.current)}
              icon={Coins01Icon}
              current={growth.revenue.current}
              previous={growth.revenue.previous}
            />
            <StatCard
              label="Orders this month"
              value={growth.orders.current.toLocaleString("en-KE")}
              icon={TaskDone01Icon}
              current={growth.orders.current}
              previous={growth.orders.previous}
            />
            <StatCard
              label="Avg order value"
              value={compactKES(growth.averageOrderValue.current)}
              icon={CreditCardIcon}
              current={growth.averageOrderValue.current}
              previous={growth.averageOrderValue.previous}
            />
            <StatCard
              label={`Sales · ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`}
              value={compactKES(sales.totalSales)}
              icon={ChartBarLineIcon}
              hint={`${sales.totalOrders.toLocaleString("en-KE")} orders`}
            />
          </>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>
              {loading
                ? "Loading…"
                : `${fullKES(sales.totalSales)} across ${sales.totalOrders.toLocaleString("en-KE")} orders`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <RevenueChartSkeleton />
            ) : (
              <RevenueChart
                // salesTrend comes back keyed by date in object order, which is
                // insertion order rather than chronological — so a chart drawn
                // straight from it can zig-zag backwards through time.
                data={[...sales.salesTrend].sort((a, b) =>
                  a.date.localeCompare(b.date),
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order status</CardTitle>
            <CardDescription>Where work is sitting right now</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <StatusBreakdownSkeleton />
            ) : (
              <StatusBreakdown counts={sales.statusCounts} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
