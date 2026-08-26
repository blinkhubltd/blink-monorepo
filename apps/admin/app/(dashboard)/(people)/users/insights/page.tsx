"use client";

import { useQuery } from "convex/react";
import {
  ShoppingBasket01Icon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

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
  SeriesChart,
} from "../../../_components/charts";
import { compactKES, count, fullKES, SERIES } from "../../../_components/format";
import {
  FactRow,
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "../../../_components/insights-shell";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";

/**
 * Customers.
 *
 * ── Why this is no longer "Users insights" ────────────────────────────────
 *
 * `getDetailedUsersInsights` had no vendor parameter at all, so it returned the
 * platform's entire user list and its role distribution to anyone who opened the
 * page. For a vendor manager that is a staff directory, not a business insight —
 * they have no claim on how many riders the platform employs.
 *
 * So the page splits. The platform block — total users, role split — renders only
 * for an unrestricted caller, because the query returns `platform: null` for
 * everyone else. What every caller gets is the customers who actually bought
 * from them, derived from their own orders, where "new" means new TO THEM.
 *
 * The URL stays /users/insights so existing links keep working.
 */
export default function CustomersInsightsPage() {
  const [range, setRange] = useInsightRange();
  const scope = useInsightScope();
  const data = useQuery(api.data.insights_domain.getCustomersInsights, {
    timeRange: range,
  });

  return (
    <div className="space-y-6">
      <InsightsHeader
        title="Customers"
        description="Who is buying, how often, and how much they spend."
        noun="customers"
        scope={scope}
        range={range}
        onRangeChange={setRange}
      />

      {!data ? (
        <CustomersInsightsSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Buying customers"
              value={count(data.buyingCustomers)}
              icon={UserGroupIcon}
              hint="Placed at least one paid order"
            />
            <StatCard
              label="New"
              value={count(data.newCustomers)}
              icon={UserAdd01Icon}
              hint={
                scope?.restricted
                  ? "First order with you in this period"
                  : "First order in this period"
              }
            />
            <StatCard
              label="Returning"
              value={count(data.returningCustomers)}
              icon={UserMultiple02Icon}
              hint={
                data.buyingCustomers > 0
                  ? `${Math.round(
                      (data.returningCustomers / data.buyingCustomers) * 100,
                    )}% of buyers had ordered before`
                  : "Nobody bought in this period"
              }
            />
            <StatCard
              label="Spend per customer"
              value={compactKES(data.averageCustomerValue)}
              icon={ShoppingBasket01Icon}
              // Per CUSTOMER, not per order — the two differ exactly when
              // customers order more than once, which is the thing this page is
              // trying to show.
              hint={`${data.ordersPerCustomer.toFixed(1)} orders each on average`}
            />
          </section>

          <FactRow
            facts={[
              {
                label: "Total from these customers",
                value: fullKES(
                  data.averageCustomerValue * data.buyingCustomers,
                ),
              },
              ...(data.platform
                ? [
                    {
                      label: "Registered users",
                      value: count(data.platform.totalUsers),
                    },
                    {
                      label: "New signups",
                      value: count(data.platform.newUsers),
                    },
                  ]
                : []),
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Customers buying each day</CardTitle>
              <CardDescription>
                {/*
                  Distinct buyers, not order count. One customer placing five
                  orders is one person, and a chart that counts orders here would
                  make a single wholesale buyer look like a busy day.
                */}
                Distinct buyers per day, so one customer ordering five times
                counts once
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SeriesChart
                data={data.activeByDay}
                series={[
                  {
                    key: "customers",
                    label: "Customers",
                    color: SERIES.primary,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top customers by spend</CardTitle>
                <CardDescription>
                  {scope?.restricted
                    ? "Spend with your vendors in this period"
                    : "Spend across the platform in this period"}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {data.topCustomers.length === 0 ? (
                  <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                    Nobody bought in this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="max-w-[240px]">
                            <p className="truncate font-medium">
                              {customer.name}
                            </p>
                            {customer.email ? (
                              <p className="text-muted-foreground truncate text-xs">
                                {customer.email}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {count(customer.orders)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {compactKES(customer.spent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/*
              Platform only. A restricted caller gets `platform: null` from the
              server, so this cannot render for them even by mistake — the
              absence is enforced by the payload, not by a conditional here.
            */}
            {data.platform ? (
              <Card>
                <CardHeader>
                  <CardTitle>Everyone on the platform</CardTitle>
                  <CardDescription>
                    All registered accounts by role, customers included
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    data={data.platform.byRole.map((entry) => ({
                      name: entry.role,
                      value: entry.count,
                    }))}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Repeat purchase</CardTitle>
                  <CardDescription>
                    New against returning buyers in this period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    data={[
                      {
                        name: "Returning",
                        value: data.returningCustomers,
                        color: "var(--chart-4)",
                      },
                      {
                        name: "New",
                        value: data.newCustomers,
                        color: "var(--chart-1)",
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CustomersInsightsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
      <Card>
        <CardContent className="pt-6">
          <ChartSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
