"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  BriefcaseDollarIcon as Briefcase,
  PackageIcon as Package,
  ShoppingCartIcon as ShoppingCart,
  Store01Icon as Store,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { formatKES } from "@/lib/utils";
import { TimeRangeSelector } from "@/components/insights/TimeRangeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/ui/badge";

export default function IndustriesInsightsPage() {
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const router = useRouter();

  if (!permsLoading && !isAdminUser) {
    router.replace("/insights");
    return null;
  }

  const insights = useQuery(api.data.insights.getDetailedIndustriesInsights, {
    timeRange: timeRange as any,
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
                Industries Insights
              </h1>
              <p className="text-muted-foreground">
                Performance analytics across all industries
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap gap-4 items-center">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>

        {insights && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Total Industries
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.totalIndustries}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Briefcase} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Active Industries
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {insights.activeIndustries}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Store} className="w-8 h-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Total Revenue
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatKES(insights.totalRevenue)}
                      </p>
                    </div>
                    <HugeiconsIcon icon={ShoppingCart} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Industry Details Table */}
            <Card className="shadow-sm">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base">
                  Industry Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Industry
                        </th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Vendors
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Products
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Orders
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {insights.industries.map((ind: { name: string; status: string; vendors: number; products: number; orders: number; revenue: number }, i: number) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{ind.name}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                ind.status === "Active"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {ind.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {ind.vendors}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {ind.products}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {ind.orders}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-600 font-medium">
                            {formatKES(ind.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Share */}
            {insights.industries.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Revenue Share by Industry
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {insights.industries.map((ind: { name: string; status: string; vendors: number; products: number; orders: number; revenue: number }, i: number) => {
                      const totalRev = insights.industries.reduce(
                        (s: number, i: { revenue: number }) => s + i.revenue,
                        0,
                      );
                      const pct =
                        totalRev > 0
                          ? ((ind.revenue / totalRev) * 100).toFixed(1)
                          : "0";
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm font-medium w-32 truncate">
                            {ind.name}
                          </span>
                          <div className="flex items-center gap-3 flex-1 ml-4">
                            <div className="flex-1 bg-muted rounded-full h-3">
                              <div
                                className="bg-yellow-500 rounded-full h-3 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium tabular-nums w-24 text-right">
                              {formatKES(ind.revenue)}
                            </span>
                            <span className="text-xs text-muted-foreground w-12 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
