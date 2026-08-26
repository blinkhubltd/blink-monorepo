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
import { compactKES, count } from "./format";

export interface RevenueRow {
  name: string;
  /** Whatever the second column counts — see `countLabel`. */
  orders: number;
  revenue: number;
}

/**
 * A name / orders / revenue table, with a share column.
 *
 * The old dashboard had four hand-rolled copies of this — in the insights page,
 * the orders page, the products page and the industries page — each with its own
 * `<table>`, its own sticky header and its own green revenue class. They also
 * each dropped the share, which is the column that makes the rows comparable:
 * "Ksh 40k" means nothing until you know whether that is most of the total or a
 * rounding error.
 *
 * The share is computed from the rows PRESENT, and says so, because a truncated
 * or filtered list would otherwise imply the shares add to the whole business.
 */
export function RevenueTable({
  title,
  description,
  rows,
  emptyMessage = "Nothing in this period.",
  limit = 12,
  countLabel = "Orders",
}: {
  title: string;
  description?: string;
  rows: RevenueRow[];
  emptyMessage?: string;
  limit?: number;
  /**
   * Header for the count column. Overridable because not every caller counts
   * orders — the products page counts products per category, and a column
   * headed "Orders" showing product counts is worse than no column.
   */
  countLabel?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const shown = rows.slice(0, limit);
  const hidden = rows.length - shown.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-6 py-8 text-center text-sm">
            {emptyMessage}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">{countLabel}</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right">
                      {count(row.orders)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {compactKES(row.revenue)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right">
                      {total > 0
                        ? `${Math.round((row.revenue / total) * 100)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/*
              Said out loud rather than silently truncated. A list that stops at
              twelve without saying so reads as the complete set.
            */}
            {hidden > 0 ? (
              <p className="text-muted-foreground px-6 pt-3 text-xs">
                {hidden} more not shown. Share is of the rows listed here.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
