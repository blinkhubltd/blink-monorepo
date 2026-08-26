"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { AXIS_TICK, compactKES, fullKES, SERIES, shortDate } from "./format";

/**
 * The chart vocabulary for the dashboards.
 *
 * recharts directly, following sydia's convention rather than a wrapper — but
 * unlike sydia's insights, every colour here comes from a theme token
 * (`var(--chart-n)`), so a chart follows the brand and dark mode without a
 * per-chart override. Sydia's own charts inline hex ported from a prototype,
 * which is the thing this app just stopped doing everywhere else.
 *
 * A note that has bitten this project before: theme tokens must be passed to
 * recharts DIRECTLY. Wrapping one in `hsl()` yields black, silently.
 */

const CHART_HEIGHT = 280;

// ---------------------------------------------------------------------------
// Shared tooltip
// ---------------------------------------------------------------------------

interface TooltipRow {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  money,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
  money?: boolean;
  labelFormatter?: (value: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((r) => r.value != null);
  if (rows.length === 0) return null;

  return (
    <div className="bg-popover text-popover-foreground min-w-[140px] rounded-lg border p-2.5 shadow-md">
      {label ? (
        <p className="text-muted-foreground mb-1 text-xs">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      ) : null}
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div
            key={`${row.dataKey ?? i}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-1.5">
              {row.color ? (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
              ) : null}
              <span className="text-muted-foreground text-xs capitalize">
                {row.name ?? "Value"}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {money
                ? fullKES(row.value ?? 0)
                : (row.value ?? 0).toLocaleString("en-KE")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="text-muted-foreground flex items-center justify-center text-sm"
      style={{ height: CHART_HEIGHT }}
    >
      {message}
    </div>
  );
}

export function ChartSkeleton({ height = CHART_HEIGHT }: { height?: number }) {
  return <Skeleton style={{ height }} className="w-full" />;
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

/**
 * Revenue and order count over time, on two axes.
 *
 * Both series on one chart because the interesting reading is when they
 * DIVERGE — revenue up with orders flat means basket size grew, and that is
 * invisible on two separate charts.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <EmptyChart message="No sales in this period." />;

  if (data.length === 1) {
    const only = data[0]!;
    return (
      <div
        className="flex flex-col items-center justify-center gap-1"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-2xl font-bold tabular-nums">
          {fullKES(only.revenue)}
        </p>
        <p className="text-muted-foreground text-sm">
          {shortDate(only.date)} — one day of data, so there is no trend to plot
          yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: CHART_HEIGHT }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="money"
            tickFormatter={compactKES}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip money labelFormatter={shortDate} />}
          />
          <Area
            yAxisId="money"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={SERIES.primary}
            strokeWidth={2}
            fill="url(#trendRevenue)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Area
            yAxisId="count"
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke={SERIES.secondary}
            strokeWidth={1.5}
            // Unfilled: two filled areas on one chart obscure each other, and
            // the order count is a reference line rather than a magnitude.
            fill="transparent"
            strokeDasharray="4 3"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

export interface Slice {
  name: string;
  value: number;
  /** A theme token. Falls back to the series ramp when absent. */
  color?: string;
}

const RAMP = [
  SERIES.primary,
  SERIES.secondary,
  SERIES.info,
  SERIES.success,
  SERIES.danger,
];

/**
 * A donut, for a mix with FEW categories.
 *
 * Capped at six slices plus an "Other" roll-up: past that the small slices
 * become unlabellable slivers, which is why the order-status breakdown uses a
 * proportional bar instead.
 */
export function DonutChart({
  data,
  money = false,
}: {
  data: Slice[];
  money?: boolean;
}) {
  if (data.length === 0) return <EmptyChart message="Nothing to show yet." />;

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 6);
  const tail = sorted.slice(6);
  const slices =
    tail.length > 0
      ? [
          ...head,
          {
            name: "Other",
            value: tail.reduce((sum, s) => sum + s.value, 0),
          },
        ]
      : head;

  return (
    <div style={{ height: CHART_HEIGHT }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {slices.map((slice, i) => (
              <Cell
                key={slice.name}
                fill={slice.color ?? RAMP[i % RAMP.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip money={money} />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-muted-foreground text-xs">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked bars
// ---------------------------------------------------------------------------

export interface RankedItem {
  name: string;
  value: number;
}

/**
 * A horizontal bar chart for "top N" lists.
 *
 * Horizontal because the labels are product and people names — vertical bars
 * would either truncate them or rotate them to 45 degrees, and a rotated label
 * is a label nobody reads.
 */
export function RankedBars({
  data,
  money = false,
}: {
  data: RankedItem[];
  money?: boolean;
}) {
  if (data.length === 0) return <EmptyChart message="Nothing to rank yet." />;

  return (
    <div
      style={{ height: Math.max(160, data.length * 34 + 24) }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="var(--border)"
          />
          <XAxis
            type="number"
            tickFormatter={money ? compactKES : undefined}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={140}
            // Truncated rather than wrapped: a wrapped label changes the row
            // height and the bars stop lining up with the axis.
            tickFormatter={(v: string) =>
              v.length > 20 ? `${v.slice(0, 19)}…` : v
            }
          />
          <Tooltip content={<ChartTooltip money={money} />} cursor={false} />
          <Bar dataKey="value" name={money ? "Revenue" : "Count"} radius={[0, 4, 4, 0]}>
            {data.map((item, i) => (
              <Cell key={item.name} fill={i === 0 ? SERIES.primary : SERIES.secondary} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
