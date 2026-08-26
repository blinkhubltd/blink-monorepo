"use client";

import { useQuery } from "convex/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  TimerIcon,
  TruckDeliveryIcon,
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
  ChartSkeleton,
  DonutChart,
  SeriesChart,
} from "../../../_components/charts";
import {
  count,
  humanDuration,
  percent,
  SERIES,
} from "../../../_components/format";
import {
  FactRow,
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "../../../_components/insights-shell";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";
import { StatusBreakdown } from "../../../_components/status-breakdown";

/**
 * Shipments: outcomes, and how long delivery takes.
 *
 * Three corrections to the old page, all of them about what the numbers meant:
 *
 *  - Success rate was `delivered / all shipments`, so anything still out with a
 *    rider counted as a failure and a busy day looked like a bad one. It is now
 *    delivered over FINISHED, and null rather than zero when nothing has
 *    finished — the old version showed "0.0%" on a hub's first morning.
 *
 *  - "Avg delivery" was a mean over `updated_at - _creationTime`. It is now two
 *    separate medians, because the customer's wait and the rider's transit are
 *    different questions and a mean hides the typical case behind one outlier.
 *
 *  - The daily figures were a scrolling table of dates. Created against
 *    delivered is a chart: the thing worth seeing is created outrunning
 *    delivered day after day, which is a backlog forming, and no table shows
 *    that.
 */
export default function ShipmentsInsightsPage() {
  const [range, setRange] = useInsightRange();
  const scope = useInsightScope();
  const data = useQuery(api.data.insights_domain.getShipmentsInsights, {
    timeRange: range,
  });

  return (
    <div className="space-y-6">
      <InsightsHeader
        title="Shipments"
        description="Delivery outcomes, and how long fulfilment takes."
        noun="shipments"
        scope={scope}
        range={range}
        onRangeChange={setRange}
      />

      {!data ? (
        <ShipmentsInsightsSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Shipments"
              value={count(data.totalShipments)}
              icon={TruckDeliveryIcon}
              hint={`${count(data.inFlight)} still out with a rider`}
            />
            <StatCard
              label="Delivered"
              value={count(data.delivered)}
              icon={CheckmarkCircle02Icon}
              hint={
                data.successRate === null
                  ? "Nothing has finished yet"
                  : `${data.successRate}% of finished deliveries`
              }
            />
            <StatCard
              label="Failed"
              value={count(data.failed)}
              icon={Alert02Icon}
              inverse
              hint={data.failed === 0 ? "None this period" : "Worth a look"}
            />
            <StatCard
              label="Customer wait"
              value={humanDuration(data.medianFulfilmentMs)}
              icon={Clock01Icon}
              // Named as a median in the hint, because a median and a mean
              // answer different questions and the reader should know which.
              hint="Median, order placed to delivered"
            />
            <StatCard
              label="Rider transit"
              value={humanDuration(data.medianTransitMs)}
              icon={TimerIcon}
              hint="Median, shipment created to delivered"
            />
          </section>

          <FactRow
            facts={[
              { label: "Success rate", value: percent(data.successRate) },
              { label: "In flight", value: count(data.inFlight) },
              {
                // The one figure here that is a data-integrity problem rather
                // than a measurement: an order in the period that never got a
                // shipment record at all.
                label: "Orders with no shipment",
                value: count(data.withoutShipment),
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Created against delivered</CardTitle>
              <CardDescription>
                When the created line runs above delivered for several days, a
                backlog is forming
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/*
                Both series are shipment counts, so a shared axis is honest here
                — which is exactly why the orders page uses a reference line
                instead, where one series is money.
              */}
              <SeriesChart
                data={data.trend}
                series={[
                  { key: "created", label: "Created", color: SERIES.primary },
                  {
                    key: "delivered",
                    label: "Delivered",
                    color: SERIES.success,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Where shipments are</CardTitle>
                <CardDescription>
                  Every shipment in the period by state
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBreakdown
                  counts={Object.fromEntries(
                    data.statusDistribution.map((s) => [s.status, s.count]),
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Outcome mix</CardTitle>
                <CardDescription>
                  Five states, so a ring reads — the old page drew the same data
                  twice, once as a pie and once as a bar list
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={data.statusDistribution.map((entry) => ({
                    name: entry.status,
                    value: entry.count,
                    color:
                      entry.status === "Delivered"
                        ? "var(--chart-4)"
                        : entry.status === "Failed Delivery"
                          ? "var(--chart-5)"
                          : undefined,
                  }))}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function ShipmentsInsightsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
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
