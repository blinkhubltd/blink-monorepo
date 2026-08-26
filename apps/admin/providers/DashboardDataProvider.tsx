"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

/**
 * The base lists every dashboard page reads.
 *
 * ── Six queries removed ───────────────────────────────────────────────────
 *
 * This provider used to run `getSalesAnalytics`, `getRiderPerformance`,
 * `getProductPerformance`, `getOrderStatusDistribution`, `getRevenueByCategory`
 * and `getTotalBlinkRevenue` on top of the lists below. None of them takes a
 * vendor argument, so every page in the app — not just the insights ones —
 * fetched platform-wide revenue for whoever was signed in, including a vendor
 * manager who is not allowed to see it.
 *
 * They were also, by the time the insights pages moved to scoped queries, read
 * by nobody: their only consumers were the old insights page and
 * `VendorInsights`. So this is six unindexed full-table aggregations per page
 * load, for data nothing rendered.
 *
 * Insight figures now come from `data/insights_dashboard` and
 * `data/insights_domain`, which resolve the vendor scope server-side. Nothing
 * aggregated belongs in this provider: a value cached app-wide cannot carry the
 * period a page asked for, which is how the old dashboard ended up showing
 * "this month" and "all time" side by side.
 *
 * ── Still outstanding ─────────────────────────────────────────────────────
 *
 * The lists below are themselves unscoped and unbounded — `getAllProducts`,
 * `getOrders`, `getAllCustomers` and the rest fetch entire tables for every
 * page, and a vendor manager receives every vendor's products. Fixing that is a
 * per-page change (each consumer needs a filtered or paginated query instead of
 * a shared blob), not something this provider can do, so it is tracked
 * separately rather than half-done here.
 */
type DashboardDataContextValue = {
  products: any[];
  categories: any[];
  orders: any[];
  riders: any[];
  customers: any[];
  vendors: any[];
  shipments: any[];
  pickers: any[];
  availableRiders: any[];
  schedules: any[];
  isLoaded: boolean;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(
  null,
);

export default function DashboardDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const products = useQuery(api.data.products.getAllProducts) ?? [];
  const categories = useQuery(api.data.categories.getAllCategories) ?? [];
  const orders = useQuery(api.data.orders.getOrders) ?? [];
  const riders = useQuery(api.user.users.getAllRiders) ?? [];
  const customers = useQuery(api.user.users.getAllCustomers) ?? [];
  const vendors = useQuery(api.data.vendors.getAllVendors) ?? [];
  const shipments = useQuery(api.data.shipments.getAllShipments) ?? [];
  const pickers = useQuery(api.user.users.getAllPickers) ?? [];
  const availableRiders = useQuery(api.data.shipments.getAvailableRiders) ?? [];
  const schedules = useQuery(api.data.schedules.getAllSchedules) ?? [];

  const isLoaded = useMemo(() => {
    return (
      products !== null &&
      categories !== null &&
      orders !== null &&
      riders !== null &&
      customers !== null &&
      vendors !== null &&
      shipments !== null &&
      pickers !== null &&
      availableRiders !== null &&
      schedules !== null
    );
  }, [
    products,
    categories,
    orders,
    riders,
    customers,
    vendors,
    shipments,
    pickers,
    availableRiders,
    schedules,
  ]);

  const value = useMemo(
    () => ({
      products,
      categories,
      orders,
      riders,
      customers,
      vendors,
      shipments,
      pickers,
      availableRiders,
      schedules,
      isLoaded,
    }),
    [
      products,
      categories,
      orders,
      riders,
      customers,
      vendors,
      shipments,
      pickers,
      availableRiders,
      schedules,
      isLoaded,
    ],
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error(
      "useDashboardData must be used within DashboardDataProvider",
    );
  }
  return ctx;
}
