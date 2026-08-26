"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRightIcon,
  BuildingIcon,
  PackageIcon,
  ShoppingCartIcon,
  Store01Icon,
  TruckDeliveryIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { api } from "@repo/backend";

import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { SalesTab } from "./_components/sales-tab";
import { OperationsTab } from "./_components/operations-tab";
import { PerformanceTab } from "./_components/performance-tab";

/**
 * Insights: sales, operations, performance.
 *
 * -- What this replaces, and why ------------------------------------------
 *
 * The previous version of this page called five UNSCOPED queries alongside the
 * two it did scope, so a vendor manager saw the whole platform's revenue:
 * getTotalBlinkRevenue, getRevenueByCategory, getOrderStatusDistribution,
 * getRiderPerformance and getGrowthMetrics take no vendor argument at all. It
 * also passed the vendor id from the client, which nothing on the server
 * verified, and it read the restriction from currentUser in the browser.
 *
 * Every query here derives its scope from the caller server-side instead. A
 * business owner sees the platform; a vendor manager sees exactly their vendors
 * and cannot ask for anything else, because there is no argument to ask with.
 *
 * -- Structure ------------------------------------------------------------
 *
 * Tabbed, following sydia. ONE period selector shared by all three tabs. The
 * old page had four separate selectors, which lets two figures on the same
 * screen silently describe different windows -- total sales for this month
 * beside order status for last week, with nothing saying so.
 *
 * Each tab's query runs only while that tab is open. These are the heaviest
 * reads in the app, and fetching all three up front would triple the cost of
 * opening a page most people use for one of them.
 */

const RANGES = [
  { value: "today", label: "Today" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
] as const;

type Range = (typeof RANGES)[number]["value"];
type TabId = "sales" | "operations" | "performance";

/**
 * The per-domain insight pages, which still run unscoped queries.
 *
 * Linked only for unrestricted callers. A vendor manager following one of these
 * would land on platform-wide figures, so until those pages are ported the
 * links themselves are part of the leak.
 */
const DETAIL_PAGES = [
  { href: "/orders/insights", label: "Orders", icon: ShoppingCartIcon },
  { href: "/shipments/insights", label: "Shipments", icon: TruckDeliveryIcon },
  { href: "/products/insights", label: "Products", icon: PackageIcon },
  { href: "/users/insights", label: "Users", icon: UserGroupIcon },
  { href: "/industries/insights", label: "Industries", icon: BuildingIcon },
] as const;

export default function InsightsPage() {
  const [range, setRange] = useState<Range>("thisMonth");
  const [tab, setTab] = useState<TabId>("sales");

  const scope = useQuery(api.data.insights_dashboard.getInsightsScope, {});

  const sales = useQuery(
    api.data.insights_dashboard.getSalesInsights,
    tab === "sales" ? { timeRange: range } : "skip",
  );
  const operations = useQuery(
    api.data.insights_dashboard.getOperationsInsights,
    tab === "operations" ? { timeRange: range } : "skip",
  );
  const performance = useQuery(
    api.data.insights_dashboard.getPerformanceInsights,
    tab === "performance" ? { timeRange: range } : "skip",
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground text-sm">
            Sales, operations and team performance.
          </p>

          {/*
            A vendor manager seeing smaller figures than they expect needs to
            know they are scoped rather than wrong. The vendors are NAMED, not
            merely flagged -- "restricted view" tells them nothing about to what.
          */}
          {scope?.restricted ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <HugeiconsIcon
                icon={Store01Icon}
                className="text-muted-foreground size-3.5"
              />
              <span className="text-muted-foreground text-xs">
                Showing only
              </span>
              {scope.vendors.map((vendor) => (
                <Badge key={vendor._id} variant="secondary" className="text-xs">
                  {vendor.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <Select
          value={range}
          onValueChange={(value) => setRange(value as Range)}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <SalesTab data={sales} />
        </TabsContent>
        <TabsContent value="operations" className="mt-4">
          <OperationsTab data={operations} />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <PerformanceTab data={performance} />
        </TabsContent>
      </Tabs>

      {scope && !scope.restricted ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Go deeper</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {DETAIL_PAGES.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className="hover:bg-muted/50 group flex items-center gap-2.5 rounded-lg border p-3 transition-colors"
                >
                  <HugeiconsIcon
                    icon={page.icon}
                    className="text-muted-foreground group-hover:text-foreground size-4 shrink-0"
                  />
                  <span className="truncate text-sm font-medium">
                    {page.label}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRightIcon}
                    className="text-muted-foreground group-hover:text-foreground ml-auto size-3.5 shrink-0"
                  />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
