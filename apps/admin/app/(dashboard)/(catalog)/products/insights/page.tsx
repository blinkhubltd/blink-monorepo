"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Alert02Icon,
  Coins01Icon,
  PackageIcon,
  PackageRemoveIcon,
  ArchiveIcon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  ChartSkeleton,
  RankedBars,
} from "../../../_components/charts";
import { compactKES, count, fullKES } from "../../../_components/format";
import {
  FactRow,
  InsightsHeader,
  useInsightRange,
  useInsightScope,
} from "../../../_components/insights-shell";
import { StatCard, StatCardSkeleton } from "../../../_components/stat-card";
import { StatusBreakdown } from "../../../_components/status-breakdown";
import { RevenueTable } from "../../../_components/revenue-table";

/**
 * Products: what is stocked, what is selling, and what needs reordering.
 *
 * The old page reported inventory and a top-ten. What it never answered is the
 * question a catalogue page exists for — which stock is not moving. `idleCount`
 * is products in stock with no sales in the period: capital sitting still. It
 * needs both conditions, because an out-of-stock product with no sales is not
 * idle stock, it is simply absent.
 */
export default function ProductsInsightsPage() {
  const [range, setRange] = useInsightRange();
  const [category, setCategory] = useState<string>("all");
  const scope = useInsightScope();

  const categories = useQuery(api.data.categories.getAllCategories);

  const data = useQuery(api.data.insights_domain.getProductsInsights, {
    timeRange: range,
    categoryId:
      category === "all" ? undefined : (category as Id<"categories">),
  });

  return (
    <div className="space-y-6">
      <InsightsHeader
        title="Products"
        description="Catalogue, stock position, and what is actually selling."
        noun="products"
        scope={scope}
        range={range}
        onRangeChange={setRange}
      />

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {(categories ?? []).map((entry) => (
            <SelectItem key={entry._id} value={entry._id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!data ? (
        <ProductsInsightsSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Products"
              value={count(data.totalProducts)}
              icon={PackageIcon}
              hint={`${count(data.totalUnits)} units on hand`}
            />
            <StatCard
              label="Stock value"
              value={compactKES(data.inventoryValue)}
              icon={Coins01Icon}
              hint="Price times quantity, at list price"
            />
            <StatCard
              label="Low stock"
              value={count(data.lowStockCount)}
              icon={Alert02Icon}
              // Fewer is better.
              inverse
              hint={`Under ${data.lowStockThreshold} units left`}
            />
            <StatCard
              label="Out of stock"
              value={count(data.outOfStockCount)}
              icon={PackageRemoveIcon}
              inverse
              hint={
                data.outOfStockCount === 0
                  ? "Everything is available"
                  : "Unsellable until restocked"
              }
            />
            <StatCard
              label="Not selling"
              value={count(data.idleCount)}
              icon={ArchiveIcon}
              inverse
              hint="In stock, no sales this period"
            />
          </section>

          <FactRow
            facts={[
              { label: "Stock value", value: fullKES(data.inventoryValue) },
              {
                label: "Idle share",
                value:
                  data.totalProducts > 0
                    ? `${Math.round((data.idleCount / data.totalProducts) * 100)}%`
                    : "—",
              },
            ]}
          />

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top products by revenue</CardTitle>
                <CardDescription>
                  What is actually earning, not just moving
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  money
                  data={data.topProducts.map((p) => ({
                    name: p.name,
                    value: p.revenue,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Catalogue status</CardTitle>
                <CardDescription>
                  Every product by its listing state
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
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <RevenueTable
              title="By category"
              description="Where the catalogue earns"
              rows={data.byCategory.map((c) => ({
                name: c.name,
                orders: c.products,
                revenue: c.revenue,
              }))}
              countLabel="Products"
              emptyMessage="No products in this selection."
            />

            <Card>
              <CardHeader>
                <CardTitle>Needs reordering</CardTitle>
                <CardDescription>
                  {/*
                    Lowest stock first, not highest revenue. This list is a
                    reorder prompt rather than a ranking, so ordering it by value
                    would bury the item about to run out.
                  */}
                  Lowest stock first — this is a to-do, not a ranking
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {data.lowStock.length === 0 ? (
                  <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                    Nothing is running low.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Left</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.lowStock.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="max-w-[220px] truncate font-medium">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                product.quantity <= 3
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {count(product.quantity)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {compactKES(product.price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Units and revenue</CardTitle>
              <CardDescription>
                {/*
                  Both columns together, because they disagree in a way worth
                  seeing: high in units and low in revenue is a cheap item doing
                  volume, which is a different business than the reverse.
                */}
                The same products by volume, so cheap high-movers are visible
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.topProducts.length === 0 ? (
                <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                  Nothing sold in this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((product) => (
                      <TableRow key={product.name}>
                        <TableCell className="max-w-[280px] truncate font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {count(product.units)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {compactKES(product.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ProductsInsightsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
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
