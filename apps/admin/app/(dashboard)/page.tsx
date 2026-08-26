"use client";

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
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { compactKES, count, fullKES } from "./_components/format";
import { StatCard, StatCardSkeleton } from "./_components/stat-card";
import {
  RevenueChart,
  RevenueChartSkeleton,
} from "./_components/revenue-chart";
import {
  StatusBreakdown,
  StatusBreakdownSkeleton,
} from "./_components/status-breakdown";
import {
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "./_components/insights-shell";

/**
 * The overview.
 *
 * ── Two fixes since this was written ──────────────────────────────────────
 *
 * It called `insights.getGrowthMetrics` and `insights.getSalesAnalytics`.
 * `getGrowthMetrics` takes NO vendor argument, so the first thing a vendor
 * manager saw on signing in was the platform's revenue. It now calls the scoped
 * queries, which resolve the caller's vendors server-side.
 *
 * That also removes a caveat this file used to carry: the KPI row compared
 * against a fixed previous month from `getGrowthMetrics` while the chart below
 * followed the period selector, so two figures on one screen described different
 * windows and the code had to explain it. `getSalesInsights` returns the previous
 * window for whatever period was asked for, so the whole page now moves
 * together.
 */
export default function OverviewPage() {
  const [range, setRange] = useInsightRange();
  const scope = useInsightScope();
  const {
    isLoading: permissionsLoading,
    isAdminUser,
    can,
  } = useCurrentUserPermissions();

  const canSeeInsights = isAdminUser || can("insights:READ");

  const sales = useQuery(
    api.data.insights_dashboard.getSalesInsights,
    canSeeInsights ? { timeRange: range } : "skip",
  );
  const operations = useQuery(
    api.data.insights_dashboard.getOperationsInsights,
    canSeeInsights ? { timeRange: range } : "skip",
  );

  // Someone with no insights permission still lands here — the rail sends every
  // signed-in user to "/". An empty dashboard would read as broken, so say
  // plainly that there is nothing for them.
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

  const loading = permissionsLoading || !sales || !operations;
  const previous = sales?.previous.available ? sales.previous : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <InsightsHeader
            title="Overview"
            description={
              scope?.restricted
                ? "How your hubs are trading, and what needs attention."
                : "How the platform is trading, and what needs attention."
            }
            noun="figures"
            scope={scope}
            range={range}
            onRangeChange={setRange}
          />
        </div>

        <Button asChild variant="outline">
          <Link href="/insights">
            Full insights
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Revenue"
              value={compactKES(sales.revenue)}
              icon={Coins01Icon}
              current={sales.revenue}
              previous={previous?.revenue}
              hint={previous ? undefined : "No prior period to compare"}
            />
            <StatCard
              label="Paid orders"
              value={count(sales.orders)}
              icon={TaskDone01Icon}
              current={sales.orders}
              previous={previous?.orders}
              hint={previous ? undefined : "No prior period to compare"}
            />
            <StatCard
              label="Average basket"
              value={compactKES(sales.basket)}
              icon={CreditCardIcon}
              current={sales.basket}
              previous={previous?.basket}
              hint={previous ? undefined : "No prior period to compare"}
            />
            <StatCard
              label="Open orders"
              value={count(operations.openOrders)}
              icon={ChartBarLineIcon}
              // Fewer open orders is better, so a fall must not read as a decline.
              inverse
              hint={`${count(operations.inFlight)} out with a rider`}
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
                : `${fullKES(sales.revenue)} across ${count(sales.orders)} paid orders`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <RevenueChartSkeleton />
            ) : (
              // Already chronological and gap-filled by the query, so no sort
              // here — the old version had to sort because getSalesAnalytics
              // returned object-insertion order, which could zig-zag backwards
              // through time.
              <RevenueChart
                data={sales.trend.map((point) => ({
                  date: point.date,
                  amount: point.revenue,
                }))}
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
              <StatusBreakdown
                counts={Object.fromEntries(
                  operations.orderStatus.map((s) => [s.status, s.count]),
                )}
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
