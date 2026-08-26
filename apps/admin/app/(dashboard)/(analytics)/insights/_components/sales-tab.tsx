"use client";

import {
  Coins01Icon,
  CreditCardIcon,
  ShoppingBasket01Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";

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
  TrendChart,
} from "../../../_components/charts";
import { compactKES, fullKES } from "../../../_components/format";
import {
  StatCard,
  StatCardSkeleton,
} from "../../../_components/stat-card";

type Sales = {
  revenue: number;
  orders: number;
  basket: number;
  unpaid: number;
  cancelled: number;
  previous: { revenue: number; orders: number; basket: number; available: boolean };
  trend: { date: string; revenue: number; orders: number }[];
  topProducts: { name: string; units: number; revenue: number }[];
  paymentMix: { method: string; count: number }[];
};

/**
 * Trading. What came in, how it compares, what sold, and how it was paid for.
 *
 * Layout follows the reference e-commerce dashboard: a KPI row, then a wide trend
 * chart beside a narrow ranked list, then a mix chart beside a table.
 */
export function SalesTab({ data }: { data: Sales | undefined }) {
  if (!data) return <SalesTabSkeleton />;

  const previous = data.previous.available ? data.previous : null;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={compactKES(data.revenue)}
          icon={Coins01Icon}
          current={data.revenue}
          previous={previous?.revenue}
          hint={previous ? undefined : "No prior period to compare"}
        />
        <StatCard
          label="Paid orders"
          value={data.orders.toLocaleString("en-KE")}
          icon={TaskDone01Icon}
          current={data.orders}
          previous={previous?.orders}
          hint={previous ? undefined : "No prior period to compare"}
        />
        <StatCard
          label="Average basket"
          value={compactKES(data.basket)}
          icon={ShoppingBasket01Icon}
          current={data.basket}
          previous={previous?.basket}
          hint={previous ? undefined : "No prior period to compare"}
        />
        {/*
          Unpaid is the one number here a manager can act on today, so it earns a
          KPI slot — and `inverse` because fewer is better, which the card would
          otherwise colour as a decline.
        */}
        <StatCard
          label="Unpaid orders"
          value={data.unpaid.toLocaleString("en-KE")}
          icon={CreditCardIcon}
          inverse
          hint={
            data.cancelled > 0
              ? `${data.cancelled} cancelled this period`
              : "None cancelled this period"
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue and orders</CardTitle>
            <CardDescription>
              {fullKES(data.revenue)} across{" "}
              {data.orders.toLocaleString("en-KE")} paid orders. Revenue excludes
              unpaid and cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How customers paid</CardTitle>
            <CardDescription>Share of paid orders by method</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={data.paymentMix.map((m) => ({
                name: m.method,
                value: m.count,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products by revenue</CardTitle>
            <CardDescription>
              What is actually earning, not just moving
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              money
              data={data.topProducts.map((p) => ({
                name: p.name,
                value: p.revenue,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Units and revenue</CardTitle>
            <CardDescription>
              {/*
                Both columns together, because they disagree in a way worth
                seeing: a line at the top by units and near the bottom by revenue
                is a cheap item doing volume.
              */}
              The same products by volume, so cheap high-movers are visible
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.topProducts.length === 0 ? (
              <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                Nothing sold in this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topProducts.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {p.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.units.toLocaleString("en-KE")}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {compactKES(p.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function SalesTabSkeleton() {
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
