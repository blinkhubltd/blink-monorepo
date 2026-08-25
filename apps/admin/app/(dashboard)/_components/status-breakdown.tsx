"use client";

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Order status mix for the period.
 *
 * A stacked bar plus a list rather than a donut. A donut of seven order statuses
 * is unreadable at this size — the small slices become slivers with no room for
 * a label — and the question a manager is asking ("how much is stuck?") is
 * answered better by proportions in a row with the counts written out.
 */

/** The order statuses, in lifecycle order rather than alphabetically. */
const STATUS_ORDER = [
  "Pending",
  "Confirmed",
  "Processing",
  "Pickup",
  "Delivery",
  "Delivered",
  "Cancelled",
] as const;

type Status = (typeof STATUS_ORDER)[number];

/**
 * Colour by MEANING, not by position.
 *
 * Delivered is the success green, Cancelled the destructive red, and everything
 * in between is a stage of work — so the bar reads as "how much is done, how much
 * is moving, how much fell over" without consulting a legend.
 */
const STATUS_TONE: Record<Status, string> = {
  Pending: "bg-ink-300",
  Confirmed: "bg-ink-400",
  Processing: "bg-warning",
  Pickup: "bg-info",
  Delivery: "bg-chart-3",
  Delivered: "bg-success",
  Cancelled: "bg-destructive",
};

export function StatusBreakdown({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const rows = STATUS_ORDER.map((status) => ({
    status,
    count: counts[status] ?? 0,
  })).filter((r) => r.count > 0);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  if (total === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No orders in this period.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* The proportional bar. flex-grow by count, so widths are exact rather
          than percentage strings that drift by a pixel. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {rows.map((row) => (
          <div
            key={row.status}
            className={cn(STATUS_TONE[row.status])}
            style={{ flexGrow: row.count }}
            // Each segment is labelled: the bar alone is not accessible, and a
            // hover title is the cheapest way to make it inspectable.
            title={`${row.status}: ${row.count}`}
          />
        ))}
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.status}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STATUS_TONE[row.status],
                )}
              />
              <span className="truncate">{row.status}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="font-semibold tabular-nums">{row.count}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {Math.round((row.count / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusBreakdownSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-2.5 w-full rounded-full" />
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
