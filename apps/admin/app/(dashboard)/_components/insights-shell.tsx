"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Store01Icon } from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Badge } from "@repo/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

/**
 * The frame every insights page shares: title, period selector, and the scope
 * notice.
 *
 * ── Why this is a component and not six copies ────────────────────────────
 *
 * The scope notice is the reason. A vendor manager looking at figures smaller
 * than they expect has to be told the view is scoped, or they will read it as
 * data loss. Leaving that to each page is how the old dashboard ended up with
 * two pages that scoped and five that did not — the omission is invisible in
 * review because a missing banner looks exactly like a page for an unrestricted
 * user.
 *
 * Putting the period selector here too means the periods offered are the same
 * everywhere. The old pages each defined their own list, and one offered
 * "yesterday" and "lastYear" that the others did not.
 */

export const INSIGHT_RANGES = [
  { value: "today", label: "Today" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
] as const;

export type InsightRange = (typeof INSIGHT_RANGES)[number]["value"];

/**
 * Period state, so a page does not re-declare the union it passes to Convex.
 */
export function useInsightRange(initial: InsightRange = "thisMonth") {
  return useState<InsightRange>(initial);
}

/**
 * What the caller may see. Null while loading.
 *
 * Read straight from the server rather than from `currentUser` in the browser:
 * the browser copy is what the old pages trusted, and a value the client holds
 * is a value the client can change.
 */
export function useInsightScope() {
  return useQuery(api.data.insights_dashboard.getInsightsScope, {});
}

interface ScopeNoticeProps {
  scope: ReturnType<typeof useInsightScope>;
  /** What the scoping applies to, e.g. "orders", "products". */
  noun: string;
}

export function ScopeNotice({ scope, noun }: ScopeNoticeProps) {
  if (!scope?.restricted) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <HugeiconsIcon
        icon={Store01Icon}
        className="text-muted-foreground size-3.5"
      />
      <span className="text-muted-foreground text-xs">
        {/* Named vendors, not just "restricted" — the reader needs to know to
            WHAT, or the notice raises a question instead of answering one. */}
        Only {noun} from
      </span>
      {scope.vendors.map((vendor) => (
        <Badge key={vendor._id} variant="secondary" className="text-xs">
          {vendor.name}
        </Badge>
      ))}
    </div>
  );
}

interface InsightsHeaderProps {
  title: string;
  description: string;
  noun: string;
  scope: ReturnType<typeof useInsightScope>;
  range: InsightRange;
  onRangeChange: (range: InsightRange) => void;
}

export function InsightsHeader({
  title,
  description,
  noun,
  scope,
  range,
  onRangeChange,
}: InsightsHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
        <ScopeNotice scope={scope} noun={noun} />
      </div>

      <Select
        value={range}
        onValueChange={(value) => onRangeChange(value as InsightRange)}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INSIGHT_RANGES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </header>
  );
}

/**
 * A short row of secondary figures under the KPI cards.
 *
 * For numbers that give the headline figures their meaning but do not deserve a
 * tile of their own — the difference between "12 cancelled" as a footnote and as
 * a KPI, which would imply it is something to watch every day.
 */
export function FactRow({
  facts,
}: {
  facts: { label: string; value: string }[];
}) {
  if (facts.length === 0) return null;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
      {facts.map((fact) => (
        <span key={fact.label}>
          {fact.label}{" "}
          <span className="text-foreground font-semibold tabular-nums">
            {fact.value}
          </span>
        </span>
      ))}
    </div>
  );
}
