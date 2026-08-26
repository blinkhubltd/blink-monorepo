"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  ChartBarLineIcon as BarChart3,
  ChartUpIcon as TrendingUp,
  DollarSignIcon as DollarSign,
  ShoppingCartIcon as ShoppingCart,
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
import {
  OrderStatusChart,
  SalesTrendChart,
} from "@/components/insights/InsightsCharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Id } from "@repo/backend/dataModel";

export default function OrdersInsightsPage() {
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const { currentUser } = useAuth();
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const router = useRouter();

  // Non-admin users cannot access this page
  if (!permsLoading && !isAdminUser) {
    router.replace("/insights");
    return null;
  }

  const assignedVendorIds = currentUser?.manager_details?.vendor_id ?? [];
  const isRestrictedManager = assignedVendorIds.length > 0;

  const industries = useQuery(api.data.industry.getActiveIndustries, { limit: 100 });

  const insights = useQuery(api.data.insights.getDetailedOrdersInsights, {
    timeRange: timeRange as any,
    vendorIds: isRestrictedManager ? (assignedVendorIds as any) : undefined,
    industryId:
      industryFilter !== "all" ? (industryFilter as Id<"industry">) : undefined,
  });

  const ordersSummary = useQuery(api.data.insights.getOrdersSummary, {
    timeRange: timeRange as any,
    vendorIds: isRestrictedManager ? (assignedVendorIds as any) : undefined,
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
                Orders Insights
              </h1>
              <p className="text-muted-foreground">
                Detailed analytics for orders
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {(industries?.data ?? []).map((ind: any) => (
                <SelectItem key={ind._id} value={ind._id}>
                  {ind.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        {insights && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Total Orders
                    </p>
                    <p className="text-2xl font-bold">
                      {insights.totalOrders.toLocaleString()}
                    </p>
                  </div>
                  <HugeiconsIcon icon={ShoppingCart} className="w-8 h-8 text-muted-foreground/30" />
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
                  <HugeiconsIcon icon={DollarSign} className="w-8 h-8 text-muted-foreground/30" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Avg Order Value
                    </p>
                    <p className="text-2xl font-bold">
                      {formatKES(insights.avgOrderValue)}
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
                      Delivered
                    </p>
                    <p className="text-2xl font-bold">
                      {(
                        insights.statusDistribution?.["Delivered"] ?? 0
                      ).toLocaleString()}
                    </p>
                  </div>
                  <HugeiconsIcon icon={BarChart3} className="w-8 h-8 text-muted-foreground/30" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {insights && (
            <Card className="shadow-sm">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base">
                  Order Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="h-80 p-0">
                <OrderStatusChart data={insights.statusDistribution} />
              </CardContent>
            </Card>
          )}

          {insights && (
            <Card className="shadow-sm">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base">
                  Payment Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="h-80 p-0">
                <OrderStatusChart data={insights.paymentDistribution} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Daily Trend */}
        {insights && insights.dailyTrend.length > 0 && (
          <Card className="shadow-sm ">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Daily Orders Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-80 p-0">
              <SalesTrendChart
                data={{
                  salesTrend: insights.dailyTrend.map((d: { date: string; revenue: number }) => ({
                    date: d.date,
                    amount: d.revenue,
                  })),
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Summary Tables */}
        {ordersSummary && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SummaryTable title="By Industry" data={ordersSummary.byIndustry} />
            <SummaryTable title="By Vendor" data={ordersSummary.byVendor} />
            <SummaryTable title="By Category" data={ordersSummary.byCategory} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTable({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; orders: number; revenue: number }>;
}) {
  if (!data || data.length === 0) return null;
  return (
    <Card className="">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                  Orders
                </th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.orders.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-600 font-medium">
                    {formatKES(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
