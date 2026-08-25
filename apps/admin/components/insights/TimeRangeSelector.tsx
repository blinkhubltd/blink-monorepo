"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

export function TimeRangeSelector({
  value,
  onChange,
  size = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "default";
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={size === "sm" ? "w-28 h-7 text-xs" : "w-40"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="today">Today</SelectItem>
        <SelectItem value="yesterday">Yesterday</SelectItem>
        <SelectItem value="thisWeek">This Week</SelectItem>
        <SelectItem value="lastWeek">Last Week</SelectItem>
        <SelectItem value="thisMonth">This Month</SelectItem>
        <SelectItem value="lastMonth">Last Month</SelectItem>
        <SelectItem value="thisYear">This Year</SelectItem>
        <SelectItem value="lastYear">Last Year</SelectItem>
        <SelectItem value="all">All Time</SelectItem>
      </SelectContent>
    </Select>
  );
}
