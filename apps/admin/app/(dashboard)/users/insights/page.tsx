"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftIcon as ArrowLeft,
  CrownIcon as Crown,
  UserAdd01Icon as UserPlus,
  UserGroupIcon as Users,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { formatKES } from "@/lib/utils";
import { TimeRangeSelector } from "@/components/insights/TimeRangeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  OrderStatusChart,
  SalesTrendChart,
} from "@/components/insights/InsightsCharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@repo/ui/components/ui/badge";

export default function UsersInsightsPage() {
  const [timeRange, setTimeRange] = useState<string>("thisMonth");
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const router = useRouter();

  if (!permsLoading && !isAdminUser) {
    router.replace("/insights");
    return null;
  }

  const insights = useQuery(api.data.insights.getDetailedUsersInsights, {
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
                Users Insights
              </h1>
              <p className="text-muted-foreground">
                User analytics and growth metrics
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
                        Total Users
                      </p>
                      <p className="text-2xl font-bold">
                        {insights.totalUsers.toLocaleString()}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Users} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        New Users
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {insights.newUsersCount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        In selected period
                      </p>
                    </div>
                    <HugeiconsIcon icon={UserPlus} className="w-8 h-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        Roles
                      </p>
                      <p className="text-2xl font-bold">
                        {Object.keys(insights.byRole).length}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Crown} className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Role Distribution */}
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">Users by Role</CardTitle>
                </CardHeader>
                <CardContent className="h-80 p-0">
                  <OrderStatusChart data={insights.byRole} />
                </CardContent>
              </Card>

              {/* Role Breakdown */}
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">Role Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {Object.entries(insights.byRole)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([role, count]) => {
                        const pct =
                          insights.totalUsers > 0
                            ? (
                                ((count as number) / insights.totalUsers) *
                                100
                              ).toFixed(1)
                            : "0";
                        return (
                          <div
                            key={role}
                            className="flex items-center justify-between"
                          >
                            <Badge variant="outline">{role}</Badge>
                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary rounded-full h-2"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium tabular-nums w-20 text-right">
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

            {/* Signup Trend */}
            {insights.dailySignups.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    User Signups Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-80 p-0">
                  <SalesTrendChart
                    data={{
                      salesTrend: insights.dailySignups.map(
                        (d: { date: string; count: number }) => ({
                          date: d.date,
                          amount: d.count,
                        }),
                      ),
                    }}
                  />
                </CardContent>
              </Card>
            )}

            {/* Top Customers */}
            {insights.topCustomers.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">
                    Top Customers by Spending
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                            #
                          </th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                            Customer
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Orders
                          </th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                            Spent
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {insights.topCustomers.map(
                          (
                            c: {
                              name: string;
                              email: string;
                              orders: number;
                              spent: number;
                            },
                            i: number,
                          ) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-4 py-2 font-medium">{i + 1}</td>
                              <td className="px-4 py-2">
                                <p className="font-medium">{c.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {c.email}
                                </p>
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {c.orders}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-green-600 font-medium">
                                {formatKES(c.spent)}
                              </td>
                            </tr>
                          ),
                        )}
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
