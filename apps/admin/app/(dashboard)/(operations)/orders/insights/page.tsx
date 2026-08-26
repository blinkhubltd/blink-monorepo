"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Coins01Icon,
  CreditCardIcon,
  DeliveryTruck01Icon,
  ShoppingBasket01Icon,
  ShoppingCartIcon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

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
import {
  ChartSkeleton,
  DonutChart,
  RankedBars,
  SeriesChart,
} from "../../../_components/charts";
import { compactKES, count, SERIES } from "../../../_components/format";
import {
  FactRow,
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "../../../_components/insights-shell";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";
import { StatusBreakdown } from "../../../_components/status-breakdown";
import { RevenueTable } from "../../../_components/revenue-table";

/**
 * Orders.
 *
 * Distinct from the Sales tab on /insights, which asks "what did we earn". This
 * asks "what did we take, and did we get paid" — so it counts every order rather
 * than only the realised ones, and payment state is a headline figure.
 *
 * Two things fixed while porting:
 *
 *  - The old page called `getDetailedOrdersInsights` with the vendor scope as a
 *    client argument, so a manager could pass a competitor's id or omit it and
 *    get the platform. Scope is now resolved from the caller server-side.
 *
 *  - It also called `useQuery` AFTER an early `return null` in the permission
 *    branch, which is a hooks-order violation: the moment `permsLoading` flipped,
 *    React saw a different number of hooks between renders. The permission check
 *    belongs to the layout and the nav filter, not to a conditional return above
 *    the hooks.
 */
export default function OrdersInsightsPage() {
  const [range, setRange] = useInsightRange();
  const [industry, setIndustry] = useState<string>("all");
  const scope = useInsightScope();

  const industries = useQuery(api.data.industry.getActiveIndustries, {
    limit: 100,
  });

  const data = useQuery(api.data.insights_domain.getOrdersInsights, {
    timeRange: range,
    industryId:
      industry === "all" ? undefined : (industry as Id<"industry">),
  });

  return (
    <div className="space-y-6">
      <InsightsHeader
        title="Orders"
        description="Volume, value, and where orders are in their lifecycle."
        noun="orders"
        scope={scope}
        range={range}
        onRangeChange={setRange}
      />

      <Select value={industry} onValueChange={setIndustry}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All industries" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All industries</SelectItem>
          {(industries?.data ?? []).map((entry) => (
            <SelectItem key={entry._id} value={entry._id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!data ? (
        <OrdersInsightsSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Orders"
              value={count(data.totalOrders)}
              icon={ShoppingCartIcon}
              current={data.totalOrders}
              previous={
                data.previous.available ? data.previous.orders : undefined
              }
              hint={
                data.previous.available ? undefined : "No prior period to compare"
              }
            />
            <StatCard
              label="Revenue"
              value={compactKES(data.revenue)}
              icon={Coins01Icon}
              current={data.revenue}
              previous={
                data.previous.available ? data.previous.revenue : undefined
              }
              hint={`Paid and not cancelled`}
            />
            <StatCard
              label="Average basket"
              value={compactKES(data.averageBasket)}
              icon={ShoppingBasket01Icon}
              // Over PAID orders only. Dividing realised revenue by every order
              // including the unpaid ones understates the basket, which is what
              // the old page's avgOrderValue did.
              hint="Across paid orders only"
            />
            <StatCard
              label="Delivered"
              value={count(data.delivered)}
              icon={DeliveryTruck01Icon}
              hint={
                data.totalOrders > 0
                  ? `${Math.round((data.delivered / data.totalOrders) * 100)}% of the period`
                  : "Nothing yet"
              }
            />
            <StatCard
              label="Unpaid"
              value={count(data.unpaid)}
              icon={CreditCardIcon}
              // Fewer is better, so a fall must not be coloured as a decline.
              inverse
              hint={
                data.unpaid === 0
                  ? "Everything raised is settled"
                  : "Raised but not settled"
              }
            />
          </section>

          <FactRow
            facts={[
              { label: "Paid", value: count(data.paid) },
              { label: "Cancelled", value: count(data.cancelled) },
              {
                label: "Paid share",
                value:
                  data.totalOrders > 0
                    ? `${Math.round((data.paid / data.totalOrders) * 100)}%`
                    : "—",
              },
            ]}
          />

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Orders and revenue</CardTitle>
                <CardDescription>
                  Every order taken against the revenue actually realised — the
                  gap is what has not been paid for
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SeriesChart
                  data={data.trend}
                  series={[
                    { key: "orders", label: "Orders", color: SERIES.primary },
                    {
                      key: "revenue",
                      label: "Revenue (Ksh)",
                      color: SERIES.secondary,
                      // Reference line, unfilled: revenue and a count are
                      // different units, so this is here to show SHAPE against
                      // the order line, not to be read off the axis.
                      reference: true,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment state</CardTitle>
                <CardDescription>
                  Where every order in the period stands
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={data.paymentDistribution.map((entry) => ({
                    name: entry.status,
                    value: entry.count,
                    // Coloured by meaning rather than by position, so the ring
                    // reads without consulting the legend.
                    color:
                      entry.status === "Paid"
                        ? "var(--chart-4)"
                        : entry.status === "Failed"
                          ? "var(--chart-5)"
                          : undefined,
                  }))}
                />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Order pipeline</CardTitle>
                <CardDescription>
                  Each order by the stage it reached
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/*
                  A proportional bar rather than the old donut: seven lifecycle
                  stages in a ring become unlabellable slivers, and the question
                  is "how much is stuck", which proportions answer directly.
                */}
                <StatusBreakdown
                  counts={Object.fromEntries(
                    data.statusDistribution.map((s) => [s.status, s.count]),
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Basket sizes</CardTitle>
                <CardDescription>
                  {/*
                    Fixed bands, not quantiles: quantiles move with the period so
                    two periods cannot be compared, and "how many small baskets"
                    is the actual question.
                  */}
                  Paid orders by value, in fixed bands so periods compare
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  data={data.basketBands.map((band) => ({
                    name: band.label,
                    value: band.count,
                  }))}
                />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <RevenueTable
              title="By vendor"
              description="Which hubs the volume came through"
              rows={data.byVendor}
            />
            <RevenueTable
              title="By industry"
              description="Which lines of business the volume sits in"
              rows={data.byIndustry}
              emptyMessage="No vendor in this period has an industry set."
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>How customers paid</CardTitle>
              <CardDescription>
                Methods used across every order in the period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBars
                data={data.paymentMethods.map((entry) => ({
                  name: entry.status,
                  value: entry.count,
                }))}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function OrdersInsightsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <ChartSkeleton />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <ChartSkeleton />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
