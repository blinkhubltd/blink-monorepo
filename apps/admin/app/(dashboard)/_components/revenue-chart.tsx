"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { AXIS_TICK, compactKES, fullKES, SERIES, shortDate } from "./format";

export interface TrendPoint {
  date: string;
  amount: number;
}

/**
 * Revenue over the selected period.
 *
 * An area chart rather than bars: the series is a continuous quantity over time,
 * and bars invite reading each day as a discrete comparable when the useful
 * signal is the shape of the trend.
 */
export function RevenueChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[280px] items-center justify-center text-sm">
        No sales in this period.
      </div>
    );
  }

  // A single point draws nothing as an area — there is no span to fill — so it
  // would render as an empty box with axes. Say so instead.
  if (data.length === 1) {
    const only = data[0]!;
    return (
      <div className="flex h-[280px] flex-col items-center justify-center gap-1">
        <p className="text-2xl font-bold tabular-nums">
          {fullKES(only.amount)}
        </p>
        <p className="text-muted-foreground text-sm">
          {shortDate(only.date)} — one day of data, so there is no trend to plot
          yet.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={SERIES.primary}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={SERIES.primary}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>

          {/* Horizontal only: vertical gridlines on a date axis add ink without
              helping anyone read a value off the chart. */}
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            // Recharts drops labels rather than overlapping them, which on a
            // 30-day range leaves an axis with three dates on it.
            minTickGap={24}
          />
          <YAxis
            tickFormatter={compactKES}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip content={<MoneyTooltip />} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={SERIES.primary}
            strokeWidth={2}
            fill="url(#revenueFill)"
            // No dots at rest: on a dense series they merge into a band. The
            // active dot still marks what the tooltip is reading.
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  if (value == null) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border p-2.5 shadow-md">
      <p className="text-muted-foreground text-xs">
        {label ? shortDate(label) : ""}
      </p>
      {/* Full precision here, compact on the axis: the axis needs to be
          scannable, the tooltip needs to be exact. */}
      <p className="text-sm font-semibold tabular-nums">{fullKES(value)}</p>
    </div>
  );
}

export function RevenueChartSkeleton() {
  return <Skeleton className="h-[280px] w-full" />;
}
