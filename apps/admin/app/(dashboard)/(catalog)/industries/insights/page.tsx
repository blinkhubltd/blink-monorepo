"use client";

import { useQuery } from "convex/react";
import {
  BriefcaseDollarIcon,
  Coins01Icon,
  PackageIcon,
  Store01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  ChartSkeleton,
  DonutChart,
  RankedBars,
} from "../../../_components/charts";
import { compactKES, count, fullKES } from "../../../_components/format";
import {
  FactRow,
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "../../../_components/insights-shell";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";
import { RevenueTable } from "../../../_components/revenue-table";

/**
 * Industries: which lines of business the volume sits in.
 *
 * ── The scoping decision here was the awkward one ─────────────────────────
 *
 * An industry is a platform-level grouping and the point of the page is
 * comparing them, so there is no version of this page that is simply "filtered"
 * for a vendor manager.
 *
 * What the query does instead: a restricted caller sees only the industries their
 * own vendors sit in, and the orders and revenue counted into those rows come
 * from their own vendors ONLY. So a row reads "your contribution to Pharmacy",
 * never "Pharmacy" — the other vendors sharing that industry are invisible,
 * which is the entire requirement.
 *
 * The old page called `getDetailedIndustriesInsights`, which had no vendor
 * parameter, so a vendor manager saw every industry's revenue including their
 * direct competitors'.
 */
export default function IndustriesInsightsPage() {
  const [range, setRange] = useInsightRange();
  const scope = useInsightScope();
  const data = useQuery(api.data.insights_domain.getIndustriesInsights, {
    timeRange: range,
  });

  const restricted = scope?.restricted ?? false;

  return (
    <div className="space-y-6">
      <InsightsHeader
        title="Industries"
        description={
          restricted
            ? "Your contribution to the industries your hubs trade in."
            : "How each line of business is performing."
        }
        noun="figures"
        scope={scope}
        range={range}
        onRangeChange={setRange}
      />

      {!data ? (
        <IndustriesInsightsSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Industries"
              value={count(data.totalIndustries)}
              icon={BriefcaseDollarIcon}
              hint={`${count(data.activeIndustries)} active`}
            />
            <StatCard
              label="Vendors"
              value={count(data.totalVendors)}
              icon={Store01Icon}
              hint={restricted ? "Assigned to you" : "Across the platform"}
            />
            <StatCard
              label="Revenue"
              value={compactKES(data.totalRevenue)}
              icon={Coins01Icon}
              hint="Paid and not cancelled"
            />
            <StatCard
              label="Orders"
              value={count(data.totalOrders)}
              icon={PackageIcon}
              hint="In the selected period"
            />
          </section>

          <FactRow
            facts={[
              { label: "Total revenue", value: fullKES(data.totalRevenue) },
              {
                label: "Average per order",
                value:
                  data.totalOrders > 0
                    ? compactKES(data.totalRevenue / data.totalOrders)
                    : "—",
              },
            ]}
          />

          {data.industries.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No industry data</CardTitle>
                <CardDescription>
                  {restricted
                    ? "None of your vendors has an industry set, so there is nothing to group by."
                    : "No vendor has an industry set, so there is nothing to group by."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <section className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Revenue by industry</CardTitle>
                    <CardDescription>
                      {/*
                        The old page drew this as hand-rolled percentage bars
                        with a hardcoded yellow. Same reading, on the theme.
                      */}
                      Where the money came from in this period
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RankedBars
                      money
                      data={data.industries.map((entry) => ({
                        name: entry.name,
                        value: entry.revenue,
                      }))}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Share of orders</CardTitle>
                    <CardDescription>
                      By volume rather than value — the two disagree when one
                      industry sells cheap items in bulk
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DonutChart
                      data={data.industries.map((entry) => ({
                        name: entry.name,
                        value: entry.orders,
                      }))}
                    />
                  </CardContent>
                </Card>
              </section>

              <Card>
                <CardHeader>
                  <CardTitle>Industry detail</CardTitle>
                  <CardDescription>
                    {restricted
                      ? "Vendors and products counted are your own; revenue is your own vendors' only"
                      : "Vendors, catalogue size, and trading in the period"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Industry</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Vendors</TableHead>
                        <TableHead className="text-right">Products</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.industries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {entry.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                entry.status === "Active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {count(entry.vendors)}
                          </TableCell>
                          <TableCell className="text-right">
                            {count(entry.products)}
                          </TableCell>
                          <TableCell className="text-right">
                            {count(entry.orders)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {compactKES(entry.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {/*
            Vendor rows. For a caller with a single vendor the industry row and
            the vendor row are the same number said twice, so this only appears
            when there is more than one to compare.
          */}
          {data.vendors.length > 1 ? (
            <RevenueTable
              title="By vendor"
              description="The same period, cut by hub"
              rows={data.vendors}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function IndustriesInsightsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
