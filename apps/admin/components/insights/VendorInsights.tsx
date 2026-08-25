"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon as Calendar,
  ChartBarLineIcon as BarChart3,
  ChartUpIcon as TrendingUp,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  DollarSignIcon as DollarSign,
  PackageIcon as Package,
  PercentIcon as Percent,
  ShoppingCartIcon as ShoppingCart,
  Store01Icon as Store,
} from "@hugeicons/core-free-icons";
import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useDashboardData } from "@/providers/DashboardDataProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatKES } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Badge } from "@repo/ui/components/ui/badge";

interface VendorBreakdownData {
  vendor: {
    id: string;
    name: string;
    commission: number;
    commissionType: "percentage" | "fixed";
    status: string;
    contact: {
      name: string;
      phone: string;
      email: string;
    };
  };
  summary: {
    totalOrders: number;
    totalCheckouts: number;
    totalAmount: number;
    totalSubtotal: number;
    commissionEarned: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  breakdown: {
    ordersByStatus: Record<string, number>;
    ordersByPaymentStatus: Record<string, number>;
    topProducts: Array<{
      productId: string;
      name: string;
      quantity: number;
      revenue: number;
      orders: number;
    }>;
    salesTrend: Array<{
      date: string;
      orders: number;
      revenue: number;
    }>;
  };
  timeRange: {
    startDate: number;
    endDate: number;
    range: string;
  };
}

const timeRangeOptions = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This Week" },
  { value: "lastWeek", label: "Last Week" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "thisYear", label: "This Year" },
  { value: "lastYear", label: "Last Year" },
];

const VendorSummaryCard = ({
  title,
  value,
  icon: Icon,
  description,
  trend,
}: any) => (
  <Card className="shadow-sm hover:shadow-md transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center text-sm">
          <HugeiconsIcon icon={TrendingUp} className="w-4 h-4 text-green-600 mr-1" />
          <span className="text-green-600">{trend}</span>
        </div>
      )}
    </CardContent>
  </Card>
);

const VendorStatusBreakdown = ({
  ordersByStatus,
}: {
  ordersByStatus: Record<string, number>;
}) => {
  const statusColors: Record<string, string> = {
    Pending: "bg-yellow-100 text-yellow-800",
    Confirmed: "bg-blue-100 text-blue-800",
    Processing: "bg-purple-100 text-purple-800",
    Pickup: "bg-orange-100 text-orange-800",
    Delivery: "bg-indigo-100 text-indigo-800",
    Delivered: "bg-green-100 text-green-800",
    Cancelled: "bg-red-100 text-red-800",
    Refunded: "bg-gray-100 text-gray-800",
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <HugeiconsIcon icon={BarChart3} className="w-5 h-5 mr-2" />
          Order Status Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.entries(ordersByStatus).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between">
              <div className="flex items-center">
                <Badge
                  variant="outline"
                  className={`${statusColors[status]} border-0`}
                >
                  {status}
                </Badge>
              </div>
              <span className="font-semibold">{count} orders</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const TopProductsCard = ({
  topProducts,
}: {
  topProducts: VendorBreakdownData["breakdown"]["topProducts"];
}) => (
  <Card className="shadow-sm">
    <CardHeader>
      <CardTitle className="text-lg flex items-center">
        <HugeiconsIcon icon={Package} className="w-5 h-5 mr-2" />
        Top Performing Products
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        {topProducts.length > 0 ? (
          topProducts.map((product, index) => (
            <div
              key={product.productId}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary">
                    #{index + 1}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-sm">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty: {product.quantity} • Orders: {product.orders}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-green-600">
                  {formatKES(product.revenue)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-center py-4">
            No products found
          </p>
        )}
      </div>
    </CardContent>
  </Card>
);

export const VendorInsights: React.FC = () => {
  const { vendors } = useDashboardData();
  const { currentUser } = useAuth();
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  // Fetch active industries for the filter dropdown
  const industriesData = useQuery(api.data.industry.getActiveIndustries, {
    limit: 100,
  });
  const industries = industriesData?.data ?? [];

  // If user has assigned vendors, auto-restrict selection to those vendors
  const assignedVendorIds = currentUser?.manager_details?.vendor_id ?? [];
  const isRestrictedManager = assignedVendorIds.length > 0;

  // Filter vendors by selected industry (before applying manager restriction)
  const industryFilteredVendors = useMemo(() => {
    if (industryFilter === "all") return vendors;
    return vendors.filter((v: any) => v.industry_id === industryFilter);
  }, [vendors, industryFilter]);

  // If restricted manager, auto-select their first vendor; otherwise allow free selection
  // A restricted manager whose assignment has not landed yet has no vendor id,
  // so this falls back to "" — the same value the unrestricted case uses — rather
  // than holding undefined in a slot typed as string.
  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    (isRestrictedManager ? assignedVendorIds[0] : "") ?? "",
  );

  // Keep selectedVendorId in sync when manager details update
  useEffect(() => {
    if (isRestrictedManager && assignedVendorIds[0]) {
      setSelectedVendorId((prev) =>
        assignedVendorIds.includes(prev as any)
          ? prev
          : (assignedVendorIds[0] ?? ""),
      );
    }
  }, [isRestrictedManager, assignedVendorIds]);

  // Reset vendor selection when industry filter changes (if vendor is no longer visible)
  useEffect(() => {
    if (isRestrictedManager) return;
    if (selectedVendorId && industryFilter !== "all") {
      const stillVisible = vendors.some(
        (v: any) => v._id === selectedVendorId && v.industry_id === industryFilter,
      );
      if (!stillVisible) setSelectedVendorId("");
    }
  }, [industryFilter, vendors, selectedVendorId, isRestrictedManager]);

  const vendorBreakdown = useQuery(
    api.data.insights.getVendorBreakdown,
    selectedVendorId
      ? {
          vendorId: selectedVendorId as any,
          timeRange: timeRange as any,
        }
      : "skip",
  ) as VendorBreakdownData | null | undefined;

  const selectedVendor = useMemo(() => {
    return vendors.find((v: any) => v._id === selectedVendorId);
  }, [vendors, selectedVendorId]);

  if (!vendors || vendors.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No vendors found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vendor Selection Header */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <HugeiconsIcon icon={Store} className="w-6 h-6 mr-2" />
            Vendor Performance Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Industry Filter — hidden for restricted managers */}
            {!isRestrictedManager && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Filter by Industry
                </label>
                <Select value={industryFilter} onValueChange={setIndustryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {industries.map((industry: any) => (
                      <SelectItem key={industry._id} value={industry._id}>
                        {industry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Vendor
              </label>
              <Select
                value={selectedVendorId}
                onValueChange={setSelectedVendorId}
                disabled={isRestrictedManager && assignedVendorIds.length === 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a vendor to analyze" />
                </SelectTrigger>
                <SelectContent>
                  {isRestrictedManager
                    ? vendors
                        .filter((vendor: any) =>
                          assignedVendorIds.includes(vendor._id),
                        )
                        .map((vendor: any) => (
                          <SelectItem key={vendor._id} value={vendor._id}>
                            <div className="flex items-center space-x-2">
                              <span>{vendor.name}</span>
                              <Badge
                                variant={
                                  vendor.status === "Active"
                                    ? "default"
                                    : "secondary"
                                }
                                className="ml-auto"
                              >
                                {vendor.status}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))
                    : industryFilteredVendors.map((vendor: any) => (
                        <SelectItem key={vendor._id} value={vendor._id}>
                          <div className="flex items-center space-x-2">
                            <span>{vendor.name}</span>
                            <Badge
                              variant={
                                vendor.status === "Active"
                                  ? "default"
                                  : "secondary"
                              }
                              className="ml-auto"
                            >
                              {vendor.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Time Range
              </label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Details & Metrics */}
      {selectedVendorId && vendorBreakdown && (
        <>
          {/* Vendor Info */}
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    {vendorBreakdown.vendor.name}
                  </h2>
                  <p className="text-muted-foreground">
                    Contact: {vendorBreakdown.vendor.contact.name} •{" "}
                    {vendorBreakdown.vendor.contact.phone}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Commission: {vendorBreakdown.vendor.commission}
                    {vendorBreakdown.vendor.commissionType === "percentage"
                      ? "%"
                      : " KES per order"}
                  </p>
                </div>
                <Badge
                  variant={
                    vendorBreakdown.vendor.status === "Active"
                      ? "default"
                      : "secondary"
                  }
                  className="text-sm"
                >
                  {vendorBreakdown.vendor.status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <VendorSummaryCard
              title="Total Orders"
              value={vendorBreakdown.summary.totalOrders}
              icon={ShoppingCart}
              description="All orders placed"
            />
            <VendorSummaryCard
              title="Successful Checkouts"
              value={vendorBreakdown.summary.totalCheckouts}
              icon={CheckCircle}
              description={`${vendorBreakdown.summary.conversionRate.toFixed(1)}% conversion rate`}
            />
            <VendorSummaryCard
              title="Total Revenue"
              value={formatKES(vendorBreakdown.summary.totalAmount)}
              icon={DollarSign}
              description={`Avg: ${formatKES(vendorBreakdown.summary.avgOrderValue)}/order`}
            />
            <VendorSummaryCard
              title="Commission Earned"
              value={formatKES(vendorBreakdown.summary.commissionEarned)}
              icon={Percent}
              description={`From ${formatKES(vendorBreakdown.summary.totalSubtotal)} subtotal`}
            />
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VendorStatusBreakdown
              ordersByStatus={vendorBreakdown.breakdown.ordersByStatus}
            />
            <TopProductsCard
              topProducts={vendorBreakdown.breakdown.topProducts}
            />
          </div>

          {/* Sales Trend */}
          {vendorBreakdown.breakdown.salesTrend.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <HugeiconsIcon icon={Calendar} className="w-5 h-5 mr-2" />
                  Sales Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {vendorBreakdown.breakdown.salesTrend.map((day) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between p-2 rounded bg-gray-50"
                    >
                      <span className="text-sm font-medium">
                        {new Date(day.date).toLocaleDateString()}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-green-600">
                          {formatKES(day.revenue)}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {day.orders} orders
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {selectedVendorId && !vendorBreakdown && (
        <Card className="shadow-sm">
          <CardContent className="p-8">
            <div className="text-center">
              <HugeiconsIcon icon={Clock} className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Loading vendor insights...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedVendorId && (
        <Card className="shadow-sm">
          <CardContent className="p-8">
            <div className="text-center">
              <HugeiconsIcon icon={Store} className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground mb-2">
                Select a vendor to view insights
              </p>
              <p className="text-sm text-muted-foreground">
                Choose a vendor from the dropdown above to see detailed
                performance metrics, order breakdown, and commission analysis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VendorInsights;
