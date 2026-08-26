"use client";

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
import { Badge } from "@repo/ui/components/ui/badge";
import { ChartSkeleton, RankedBars } from "../../../_components/charts";

type Performance = {
  riders: {
    id: string;
    name: string;
    delivered: number;
    failed: number;
    inFlight: number;
    successRate: number | null;
  }[];
  pickers: { id: string; name: string; orders: number }[];
};

/**
 * Who is doing the work.
 *
 * Throughput and success rate only. Deliberately NOT a league table: the list is
 * capped, there is no rank column and no per-person revenue, because a rider does
 * not control basket size and attributing revenue to them would be a number that
 * looks like performance and is not.
 *
 * A failed delivery is frequently the customer's absence rather than the rider's
 * fault, so the success rate is shown beside the raw counts rather than instead
 * of them — the counts are what make it interpretable.
 */
export function PerformanceTab({ data }: { data: Performance | undefined }) {
  if (!data) return <PerformanceTabSkeleton />;

  const noActivity = data.riders.length === 0 && data.pickers.length === 0;

  if (noActivity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No activity in this period</CardTitle>
          <CardDescription>
            Nobody was assigned a delivery or a pick. Try a wider period.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deliveries completed</CardTitle>
            <CardDescription>
              Riders by volume this period, top ten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={data.riders.map((r) => ({
                name: r.name,
                value: r.delivered,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders picked</CardTitle>
            <CardDescription>Pickers by volume this period, top ten</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              data={data.pickers.map((p) => ({
                name: p.name,
                value: p.orders,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Rider detail</CardTitle>
          <CardDescription>
            Counts alongside the rate, because a 50% success rate over two
            deliveries means something different from 50% over two hundred
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.riders.length === 0 ? (
            <p className="text-muted-foreground px-6 py-8 text-center text-sm">
              No deliveries assigned in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">In flight</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.riders.map((rider) => (
                  <TableRow key={rider.id}>
                    <TableCell className="font-medium">{rider.name}</TableCell>
                    <TableCell className="text-right">
                      {rider.delivered.toLocaleString("en-KE")}
                    </TableCell>
                    <TableCell className="text-right">
                      {rider.failed.toLocaleString("en-KE")}
                    </TableCell>
                    <TableCell className="text-right">
                      {rider.inFlight.toLocaleString("en-KE")}
                    </TableCell>
                    <TableCell className="text-right">
                      {rider.successRate === null ? (
                        // Nothing has finished, so there is no rate — an em dash
                        // rather than 0%, which would read as total failure.
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant={
                            rider.successRate >= 90
                              ? "default"
                              : rider.successRate >= 70
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {rider.successRate}%
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PerformanceTabSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <ChartSkeleton height={220} />
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardContent className="pt-6">
          <ChartSkeleton height={240} />
        </CardContent>
      </Card>
    </div>
  );
}
