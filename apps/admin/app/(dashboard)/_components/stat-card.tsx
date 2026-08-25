"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDownRight01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { delta as computeDelta } from "./format";

interface StatCardProps {
  label: string;
  /** Already formatted — the card does not decide how a figure is written. */
  value: string;
  icon: IconSvgElement;
  /** Current and previous raw values, when a comparison is available. */
  current?: number;
  previous?: number;
  /**
   * True when a fall is good — refunds, failed deliveries, cancellations.
   * Without this the card colours every decrease red, which is wrong for half
   * the metrics a dashboard carries.
   */
  inverse?: boolean;
  hint?: string;
}

export function StatCard({
  label,
  value,
  icon,
  current,
  previous,
  inverse = false,
  hint,
}: StatCardProps) {
  const change =
    current !== undefined && previous !== undefined
      ? computeDelta(current, previous)
      : null;

  const good =
    change === null || change.direction === "flat"
      ? null
      : inverse
        ? change.direction === "down"
        : change.direction === "up";

  return (
    <Card className="gap-0 py-5">
      <CardContent className="px-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          {/* Soft brand wash rather than a filled yellow chip: four saturated
              tiles in a row compete with the chart below them. */}
          <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <HugeiconsIcon icon={icon} className="size-4" />
          </span>
        </div>

        <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </p>

        <div className="mt-2 flex min-h-5 items-center gap-1.5">
          {change ? (
            <>
              <HugeiconsIcon
                icon={
                  change.direction === "up"
                    ? ArrowUpRight01Icon
                    : change.direction === "down"
                      ? ArrowDownRight01Icon
                      : ArrowRight01Icon
                }
                className={cn(
                  "size-3.5 shrink-0",
                  good === null
                    ? "text-muted-foreground"
                    : good
                      ? "text-success"
                      : "text-destructive",
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  good === null
                    ? "text-muted-foreground"
                    : good
                      ? "text-success"
                      : "text-destructive",
                )}
              >
                {change.label}
              </span>
            </>
          ) : hint ? (
            <span className="text-muted-foreground text-xs">{hint}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="space-y-3 px-5">
        <div className="flex items-start justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}
