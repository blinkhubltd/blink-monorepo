"use client";

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  TruckDeliveryIcon,
} from "@hugeicons/core-free-icons";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { ChartSkeleton, DonutChart } from "../../../_components/charts";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";
import { StatusBreakdown } from "../../../_components/status-breakdown";

type Operations = {
  orderStatus: { status: string; count: number }[];
  shipmentStatus: { status: string; count: number }[];
  delivered: number;
  failed: number;
  inFlight: number;
  successRate: number | null;
  medianFulfilmentMs: number | null;
  awaitingPicker: number;
  openOrders: number;
};

/**
 * "How long, typically" rather than a raw millisecond figure.
 *
 * Under an hour reads in minutes; a day or more reads in days. A dashboard
 * showing "1847 minutes" makes the reader do the division.
 */
function humanDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Fulfilment. Where work is sitting, what is stuck, and how long it takes.
 */
export function OperationsTab({ data }: { data: Operations | undefined }) {
  if (!data) return <OperationsTabSkeleton />;

  const orderCounts = Object.fromEntries(
    data.orderStatus.map((s) => [s.status, s.count]),
  );

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open orders"
          value={data.openOrders.toLocaleString("en-KE")}
          icon={TruckDeliveryIcon}
          // Fewer open orders is better, so a fall must not be coloured as a
          // decline.
          inverse
          hint={`${data.inFlight.toLocaleString("en-KE")} out with a rider`}
        />
        <StatCard
          label="Delivered"
          value={data.delivered.toLocaleString("en-KE")}
          icon={CheckmarkCircle02Icon}
          hint={
            data.successRate === null
              ? "Nothing finished yet"
              : `${data.successRate}% of finished deliveries succeeded`
          }
        />
        <StatCard
          label="Failed deliveries"
          value={data.failed.toLocaleString("en-KE")}
          icon={Alert02Icon}
          inverse
          hint={data.failed === 0 ? "None this period" : "Worth a look"}
        />
        <StatCard
          label="Typical fulfilment"
          value={humanDuration(data.medianFulfilmentMs)}
          icon={Clock01Icon}
          hint={
            data.medianFulfilmentMs === null
              ? "No completed deliveries yet"
              : // Said explicitly: a median and a mean answer different
                // questions, and the reader should know which they are seeing.
                "Median, order placed to delivered"
          }
        />
      </section>

      {/*
        The one number that is a to-do rather than a measurement, so it gets its
        own callout rather than being a tile among tiles — and only when it is
        non-zero, because a standing "0 waiting" banner trains people to ignore
        the space.
      */}
      {data.awaitingPicker > 0 ? (
        <Card className="border-warning bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {data.awaitingPicker.toLocaleString("en-KE")}{" "}
              {data.awaitingPicker === 1 ? "order is" : "orders are"} waiting for
              a picker
            </CardTitle>
            <CardDescription>
              Confirmed but not assigned, so nothing is happening to them yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order pipeline</CardTitle>
            <CardDescription>
              Every order in the period, by the stage it reached
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
              A proportional bar, not a donut: seven lifecycle statuses in a
              donut turns the small ones into unlabellable slivers, and the
              question is "how much is stuck", which proportions answer directly.
            */}
            <StatusBreakdown counts={orderCounts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery outcomes</CardTitle>
            <CardDescription>
              Shipments by state — five categories, so a donut reads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={data.shipmentStatus.map((s) => ({
                name: s.status,
                // Colour by meaning: delivered is the success green and a failed
                // delivery is the destructive red, so the ring is readable
                // without consulting the legend.
                value: s.count,
                color:
                  s.status === "Delivered"
                    ? "var(--chart-4)"
                    : s.status === "Failed Delivery"
                      ? "var(--chart-5)"
                      : undefined,
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function OperationsTabSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <ChartSkeleton />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
