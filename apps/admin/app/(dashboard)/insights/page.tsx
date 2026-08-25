"use client";

import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRightIcon as ArrowRight,
  BuildingIcon as Building,
  ChartBarLineIcon as BarChart3,
  ChartDownIcon as TrendingDown,
  ChartUpIcon as TrendingUp,
  DollarSignIcon as DollarSign,
  PackageIcon as Package,
  ShoppingCartIcon as ShoppingCart,
  TruckDeliveryIcon as Truck,
  UserGroupIcon as Users,
} from "@hugeicons/core-free-icons";
import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  SalesTrendChart,
  RevenueByCategoryChart,
  OrderStatusChart,
  RiderPerformanceChart,
} from "@/components/insights/InsightsCharts";
import VendorInsights from "@/components/insights/VendorInsights";
import { formatKES } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import Link from "next/link";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";

const TimeRangeSelector = ({
  value,
  onChange,
  size = "sm",
}: {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "default";
}) => (
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

const CardLoadingSkeleton = () => (
  <div className="animate-pulse space-y-2">
    <div className="h-4 w-24 bg-gray-200 rounded" />
    <div className="h-8 w-32 bg-gray-200 rounded" />
    <div className="h-3 w-20 bg-gray-200 rounded" />
  </div>
);

const ChartLoadingSkeleton = () => (
  <div className="h-80 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
  </div>
);

function SummaryTable({
  title,
  data,
  icon: Icon,
}: {
  title: string;
  data: Array<{ name: string; orders: number; revenue: number }>;
  // hugeicons ships icon DATA, not components, so the prop type is the data
  // shape and the render goes through HugeiconsIcon.
  icon: IconSvgElement;
}) {
  if (!data || data.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <HugeiconsIcon icon={Icon} className="w-4 h-4" />
          {title}
        </CardTitle>
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

export default function InsightsPage() {
  const [salesTimeRange, setSalesTimeRange] = useState<string>("thisMonth");
  const [revenueTimeRange, setRevenueTimeRange] = useState<string>("thisMonth");
  const [orderStatusTimeRange, setOrderStatusTimeRange] =
    useState<string>("thisMonth");
  const [summaryTimeRange, setSummaryTimeRange] = useState<string>("thisMonth");

  const {
    products = [],
    categories = [],
    customers = [],
    vendors = [],
    shipments = [],
    isLoaded,
  } = useDashboardData();
  const { currentUser } = useAuth();
  const { isAdminUser } = useCurrentUserPermissions();

  // Determine vendor restriction for non-admin users
  const assignedVendorIds = currentUser?.manager_details?.vendor_id ?? [];
  const isRestrictedManager = assignedVendorIds.length > 0;

  // Queries
  const salesAnalytics = useQuery(api.data.insights.getSalesAnalytics, {
    timeRange: salesTimeRange as any,
    vendorId: isRestrictedManager ? assignedVendorIds[0] : undefined,
  });
  const orderStatusDistribution = useQuery(
    api.data.insights.getOrderStatusDistribution,
    { timeRange: orderStatusTimeRange as any },
  );
  const riderPerformance = useQuery(api.data.insights.getRiderPerformance, {
    timeRange: "thisYear" as any,
  });
  const growthMetrics = useQuery(api.data.insights.getGrowthMetrics);
  const totalBlinkRevenue = useQuery(api.data.insights.getTotalBlinkRevenue, {
    timeRange: revenueTimeRange as any,
  });
  const revenueByCategory = useQuery(api.data.insights.getRevenueByCategory, {
    timeRange: salesTimeRange as any,
  });

  // Order summary by industry/vendor/category
  const ordersSummary = useQuery(api.data.insights.getOrdersSummary, {
    timeRange: summaryTimeRange as any,
    vendorIds: isRestrictedManager ? (assignedVendorIds as any) : undefined,
  });

  const riderPerformanceData = useMemo(() => {
    return (riderPerformance || []).map((rider: { name: string; completionRate: number }) => ({
      name: rider.name,
      completionRate: rider.completionRate,
    }));
  }, [riderPerformance]);

  const stats = useMemo(() => {
    const totalSales = salesAnalytics?.totalSales ?? 0;
    const growthRate = growthMetrics?.revenue?.growthRate ?? 0;
    const activeVendors = vendors.filter(
      (v: any) => v.status === "Active",
    ).length;
    const totalCustomers = customers.length;
    const pendingShipments = shipments.filter(
      (s: any) => s.status !== "Delivered",
    ).length;

    return {
      totalSales,
      growthRate,
      activeVendors,
      totalCustomers,
      pendingShipments,
    };
  }, [salesAnalytics, growthMetrics, vendors, customers, shipments]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Blink Insights
              </h1>
              <p className="text-muted-foreground">
                {isRestrictedManager
                  ? "Performance metrics for your assigned vendors"
                  : "Key metrics and analytics for your business"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* ── KPI Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Sales
                </p>
                <TimeRangeSelector
                  value={salesTimeRange}
                  onChange={setSalesTimeRange}
                  size="sm"
                />
              </div>
              {!salesAnalytics ? (
                <CardLoadingSkeleton />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      {formatKES(stats.totalSales)}
                    </p>
                    {growthMetrics && (
                      <p className="text-xs text-muted-foreground">
                        {stats.growthRate >= 0 ? "+" : ""}
                        {stats.growthRate.toFixed(1)}% vs last month
                      </p>
                    )}
                  </div>
                  <div
                    className={`w-10 h-10 ${stats.growthRate >= 0 ? "bg-green-50" : "bg-red-50"} rounded-full flex items-center justify-center`}
                  >
                    {stats.growthRate >= 0 ? (
                      <HugeiconsIcon icon={TrendingUp} className="w-5 h-5 text-green-600" />
                    ) : (
                      <HugeiconsIcon icon={TrendingDown} className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {isAdminUser && (
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Blink Revenue
                  </p>
                  <TimeRangeSelector
                    value={revenueTimeRange}
                    onChange={setRevenueTimeRange}
                    size="sm"
                  />
                </div>
                {!totalBlinkRevenue ? (
                  <CardLoadingSkeleton />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold">
                        {formatKES(totalBlinkRevenue.totalRevenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalBlinkRevenue.orderCount.toLocaleString()} orders
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                      <HugeiconsIcon icon={DollarSign} className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Active Vendors
                  </p>
                  <p className="text-2xl font-bold">{stats.activeVendors}</p>
                  <p className="text-xs text-muted-foreground">
                    {vendors.length} total
                  </p>
                </div>
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                  <HugeiconsIcon icon={Building} className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Total Customers
                  </p>
                  <p className="text-2xl font-bold">
                    {stats.totalCustomers.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registered users
                  </p>
                </div>
                <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                  <HugeiconsIcon icon={Users} className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Pending Shipments
                  </p>
                  <p className="text-2xl font-bold">{stats.pendingShipments}</p>
                  <p className="text-xs text-muted-foreground">
                    {shipments.length} total
                  </p>
                </div>
                <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center">
                  <HugeiconsIcon icon={Truck} className="w-5 h-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Orders Summary by Industry / Vendor / Category ── */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={ShoppingCart} className="w-5 h-5" />
              Orders Summary
            </CardTitle>
            <TimeRangeSelector
              value={summaryTimeRange}
              onChange={setSummaryTimeRange}
            />
          </CardHeader>
          <CardContent className="pt-6">
            {!ordersSummary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CardLoadingSkeleton />
                <CardLoadingSkeleton />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-muted/30 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Total Orders
                    </p>
                    <p className="text-2xl font-bold">
                      {ordersSummary.totalOrders.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Total Revenue
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatKES(ordersSummary.totalRevenue)}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Avg Order Value
                    </p>
                    <p className="text-2xl font-bold">
                      {formatKES(
                        ordersSummary.totalOrders > 0
                          ? ordersSummary.totalRevenue /
                              ordersSummary.totalOrders
                          : 0,
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <SummaryTable
                    title="By Industry"
                    data={ordersSummary.byIndustry}
                    icon={Building}
                  />
                  <SummaryTable
                    title="By Vendor"
                    data={ordersSummary.byVendor}
                    icon={Package}
                  />
                  <SummaryTable
                    title="By Category"
                    data={ordersSummary.byCategory}
                    icon={BarChart3}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Charts ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-block w-1.5 h-6 bg-yellow-500 rounded" />
                  Sales Trend
                </CardTitle>
                <TimeRangeSelector
                  value={salesTimeRange}
                  onChange={setSalesTimeRange}
                />
              </CardHeader>
              <CardContent className="h-80 p-0">
                {!salesAnalytics ? (
                  <ChartLoadingSkeleton />
                ) : (
                  <SalesTrendChart data={salesAnalytics} />
                )}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-block w-1.5 h-6 bg-yellow-500 rounded" />
                  Order Status
                </CardTitle>
                <TimeRangeSelector
                  value={orderStatusTimeRange}
                  onChange={setOrderStatusTimeRange}
                />
              </CardHeader>
              <CardContent className="h-80 p-0">
                {!orderStatusDistribution ? (
                  <ChartLoadingSkeleton />
                ) : (
                  <OrderStatusChart data={orderStatusDistribution} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {revenueByCategory && (
          <RevenueByCategoryChart data={revenueByCategory} />
        )}

        {isAdminUser && riderPerformance && (
          <RiderPerformanceChart data={riderPerformanceData} />
        )}

        {/* ── Quick Links to Detailed Insights (Admin only) ── */}
        {isAdminUser && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-semibold">
                Detailed Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  {
                    href: "/orders/insights",
                    label: "Orders",
                    icon: ShoppingCart,
                  },
                  {
                    href: "/shipments/insights",
                    label: "Shipments",
                    icon: Truck,
                  },
                  {
                    href: "/products/insights",
                    label: "Products",
                    icon: Package,
                  },
                  { href: "/users/insights", label: "Users", icon: Users },
                  {
                    href: "/industries/insights",
                    label: "Industries",
                    icon: Building,
                  },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    <HugeiconsIcon icon={item.icon} className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                    <span className="text-sm font-medium">{item.label}</span>
                    <HugeiconsIcon icon={ArrowRight} className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-foreground" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vendor Insights Section */}
        <VendorInsights />
      </div>
    </div>
  );
}
