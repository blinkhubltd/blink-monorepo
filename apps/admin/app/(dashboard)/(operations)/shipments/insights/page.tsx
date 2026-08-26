"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  Clock01Icon as Clock,
  TimerIcon as Timer,
  TruckDeliveryIcon as Truck,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { TimeRangeSelector } from "@/components/insights/TimeRangeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { OrderStatusChart } from "@/components/insights/InsightsCharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/ui/badge";
import { formatDate } from "@/lib/date-utils";

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function ShipmentsInsightsPage() {
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const { currentUser } = useAuth();
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const router = useRouter();

  if (!permsLoading && !isAdminUser) {
    router.replace("/insights");
    return null;
  }

  const assignedVendorIds = currentUser?.manager_details?.vendor_id ?? [];
  const isRestrictedManager = assignedVendorIds.length > 0;

  const insights = useQuery(api.data.insights.getDetailedShipmentsInsights, {
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
                Shipments Insights
              </h1>
              <p className="text-muted-foreground">
                Delivery performance and tracking analytics
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Total
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.totalShipments.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Truck} className="w-8 h-8 text-muted-foreground/30" />
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
                      <p className="text-2xl font-bold text-green-600">
                        {insights.totalDelivered.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={CheckCircle} className="w-8 h-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Failed
                      </p>
                      <p className="text-2xl font-bold text-red-600">
                        {insights.totalFailed.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={XCircle} className="w-8 h-8 text-red-200" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Success Rate
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.successRate.toFixed(1)}%
                      </p>
                    </div>
                    <HugeiconsIcon icon={Clock} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Avg Delivery
                      </p>
                      <p className="text-2xl font-bold">
                        {formatDuration(insights.avgDeliveryTimeMs)}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Timer} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-80 p-0">
                  <OrderStatusChart data={insights.statusDistribution} />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {Object.entries(insights.statusDistribution)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([status, count]) => {
                        const total = insights.totalShipments;
                        const pct =
                          total > 0
                            ? (((count as number) / total) * 100).toFixed(1)
                            : "0";
                        return (
                          <div
                            key={status}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary rounded-full h-2"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium tabular-nums w-16 text-right">
                                {count as number} ({pct}%)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend */}
            {insights.dailyTrend.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Daily Shipment Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Created
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Delivered
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {insights.dailyTrend.map((d: any) => (
                          <tr key={d.date} className="hover:bg-muted/30">
                            <td className="px-4 py-2">{formatDate(d.date)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {d.created}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-green-600 font-medium">
                              {d.delivered}
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
