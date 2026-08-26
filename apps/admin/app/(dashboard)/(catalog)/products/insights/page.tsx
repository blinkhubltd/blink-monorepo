"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon as AlertCircle,
  ArchiveIcon as Archive,
  ArrowLeftIcon as ArrowLeft,
  ChartUpIcon as TrendingUp,
  PackageIcon as Package,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { formatKES } from "@/lib/utils";
import { TimeRangeSelector } from "@/components/insights/TimeRangeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { OrderStatusChart } from "@/components/insights/InsightsCharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Id } from "@repo/backend/dataModel";

export default function ProductsInsightsPage() {
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { currentUser } = useAuth();
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const router = useRouter();

  if (!permsLoading && !isAdminUser) {
    router.replace("/insights");
    return null;
  }

  const assignedVendorIds = currentUser?.manager_details?.vendor_id ?? [];
  const isRestrictedManager = assignedVendorIds.length > 0;

  const categories = useQuery(api.data.categories.getAllCategories);

  const insights = useQuery(api.data.insights.getDetailedProductsInsights, {
    timeRange: timeRange as any,
    vendorIds: isRestrictedManager ? (assignedVendorIds as any) : undefined,
    categoryId:
      categoryFilter !== "all"
        ? (categoryFilter as Id<"categories">)
        : undefined,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/insights"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <HugeiconsIcon icon={ArrowLeft} className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Products Insights
              </h1>
              <p className="text-muted-foreground">
                Product catalog analytics and performance
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-4 items-center">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {(categories ?? []).map((cat: any) => (
                <SelectItem key={cat._id} value={cat._id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {insights && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Total Products
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.totalProducts.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Package} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Inventory
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.totalInventory.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Archive} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Inventory Value
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatKES(insights.totalInventoryValue)}
                      </p>
                    </div>
                    <HugeiconsIcon icon={TrendingUp} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Low Stock
                      </p>
                      <p className="text-2xl font-bold text-orange-600">
                        {insights.lowStockCount.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={AlertCircle} className="w-8 h-8 text-orange-200" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Distribution */}
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Product Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-80 p-0">
                  <OrderStatusChart data={insights.statusDistribution} />
                </CardContent>
              </Card>

              {/* Top Products */}
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Top Selling Products
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {insights.topProducts.length > 0 ? (
                      insights.topProducts.map(
                        (
                          p: {
                            name: string;
                            quantity: number;
                            revenue: number;
                            category?: string;
                            orders?: number;
                          },
                          i: number,
                        ) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">
                                  #{i + 1}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Qty: {p.quantity}
                                </p>
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-green-600">
                              {formatKES(p.revenue)}
                            </p>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-muted-foreground text-center py-4">
                        No sales data
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* By Category */}
            {insights.byCategory.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Products by Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                            Category
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Products
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Revenue
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {insights.byCategory.map((c: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-4 py-2 font-medium">{c.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {c.count}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-green-600 font-medium">
                              {formatKES(c.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!insights && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
