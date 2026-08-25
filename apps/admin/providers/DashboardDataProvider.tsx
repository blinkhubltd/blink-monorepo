"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

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
  // Insights data
  salesAnalytics: any;
  riderPerformance: any[];
  productPerformance: any[];
  orderStatusDistribution: Record<string, number>;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  totalBlinkRevenue:
    | {
        totalRevenue: number;
        orderCount: number;
        averageCommissionPerOrder: number;
      }
    | null
    | undefined;
  isLoaded: boolean;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(
  null
);

export default function DashboardDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Base data queries
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

  const salesAnalytics = useQuery(api.data.insights.getSalesAnalytics, {});
  const riderPerformance =
    useQuery(api.data.insights.getRiderPerformance, { timeRange: "thisYear" }) ?? [];
  const productPerformance =
    useQuery(api.data.insights.getProductPerformance, { limit: 10 }) ?? [];
  const orderStatusDistribution =
    useQuery(api.data.insights.getOrderStatusDistribution, {}) ?? {};
  const revenueByCategory =
    useQuery(api.data.insights.getRevenueByCategory, {}) ?? [];
  const totalBlinkRevenue = useQuery(api.data.insights.getTotalBlinkRevenue, {});

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
      schedules !== null &&
      salesAnalytics !== null &&
      riderPerformance !== null &&
      productPerformance !== null &&
      orderStatusDistribution !== null &&
      revenueByCategory !== null &&
      totalBlinkRevenue !== null
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
    salesAnalytics,
    riderPerformance,
    productPerformance,
    orderStatusDistribution,
    revenueByCategory,
    totalBlinkRevenue,
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

      salesAnalytics,
      riderPerformance,
      productPerformance,
      orderStatusDistribution,
      revenueByCategory,
      totalBlinkRevenue,

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

      salesAnalytics,
      riderPerformance,
      productPerformance,
      orderStatusDistribution,
      revenueByCategory,
      totalBlinkRevenue,
      isLoaded,
    ]
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
      "useDashboardData must be used within DashboardDataProvider"
    );
  }
  return ctx;
}
