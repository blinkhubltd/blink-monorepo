import React, { createContext, useContext, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useAuth } from "@/lib/auth";
import { isRider, isPicker } from "@/lib/roles";

// Types for your data
interface DataContextType {
  // User data
  currentUser: any;
  isUserLoading: boolean;

  // Deliveries data
  allDeliveries: any[];
  pendingDeliveries: any[];
  isDeliveriesLoading: boolean;

  // Stats data
  dailyStats: any;
  performanceStats: any;
  weeklyStats: any;
  recentActivity: any[];
  isStatsLoading: boolean;

  // Orders data (for picker)
  pickerOrders: any[];
  pickerCompletedOrders: any[];
  isPickerOrdersLoading: boolean;

  // Incentives data
  riderIncentives: any;
  pickerIncentives: any;
  incentivesConfigRider: any;
  incentivesConfigPicker: any;
  isIncentivesLoading: boolean;
  // Earnings & recommendations
  riderBaseEarnings: any;
  pickerBaseEarnings: any;
  riderRecommendations: any[];
  pickerRecommendations: any[];
  saveUserTargets: (
    role: "RIDER" | "PICKER",
    daily: number,
    weekly: number,
    monthly: number,
  ) => Promise<void>;
  saveIncentiveConfig: (
    role: "RIDER" | "PICKER",
    thresholdDaily: number,
    bonusPerExtraDaily: number,
    currency?: string,
  ) => Promise<void>;
  applyRecommendedTargets: (
    role: "RIDER" | "PICKER",
    targets: { daily: number; weekly: number; monthly: number },
  ) => Promise<void>;
  saveBaseEarnings: (
    role: "RIDER" | "PICKER",
    monthlyAmount: number,
    currency?: string,
  ) => Promise<void>;
  // Helper functions
  refreshData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const currentUser = useQuery(api.user.users.getCurrentUser, {
    clerkId: user?.id || "",
  });

  const riderId = currentUser?._id;

  // Fetch all deliveries data using existing functions
  const allDeliveries = useQuery(
    api.data.shipments.listRiderDeliveries,
    riderId ? { riderId: riderId as Id<"users"> } : "skip",
  );

  const pendingDeliveries = useQuery(
    api.data.shipments.listRiderDeliveries,
    riderId ? { riderId: riderId as Id<"users">, onlyPending: true } : "skip",
  );

  // Fetch rider statistics using existing functions
  const dailyStats = useQuery(
    api.data.rider_analytics.getRiderDailyStats,
    riderId ? { riderId: riderId as Id<"users"> } : "skip",
  );

  const performanceStats = useQuery(
    api.data.rider_analytics.getRiderPerformanceStats,
    riderId ? { riderId: riderId as Id<"users"> } : "skip",
  );

  const weeklyStats = useQuery(
    api.data.rider_analytics.getRiderWeeklyStats,
    riderId ? { riderId: riderId as Id<"users"> } : "skip",
  );

  const recentActivity = useQuery(
    api.data.rider_analytics.getRiderRecentActivity,
    riderId ? { riderId: riderId as Id<"users">, limit: 10 } : "skip",
  );

  // Fetch picker orders (only if user is a picker)
  const pickerOrders = useQuery(
    api.data.picker_orders.getPickerOrders,
    riderId && isPicker(currentUser?.roleName)
      ? { pickerId: riderId as Id<"users"> }
      : "skip",
  );

  const pickerCompletedOrders = useQuery(
    api.data.picker_orders.getPickerCompletedOrders,
    riderId && isPicker(currentUser?.roleName)
      ? { pickerId: riderId as Id<"users"> }
      : "skip",
  );

  // Incentives queries (only fetch relevant dashboard per role)
  const riderIncentives = useQuery(
    api.data.incentives?.getIncentiveDashboard as any,
    riderId && isRider(currentUser?.roleName)
      ? { user_id: riderId as Id<"users">, role: "RIDER" }
      : "skip",
  );
  const pickerIncentives = useQuery(
    api.data.incentives?.getIncentiveDashboard as any,
    riderId && isPicker(currentUser?.roleName)
      ? { user_id: riderId as Id<"users">, role: "PICKER" }
      : "skip",
  );
  const incentivesConfigRider = useQuery(
    api.data.incentives?.getIncentiveConfig as any,
    currentUser?.roleName ? { role: "RIDER" } : "skip",
  );
  const incentivesConfigPicker = useQuery(
    api.data.incentives?.getIncentiveConfig as any,
    currentUser?.roleName ? { role: "PICKER" } : "skip",
  );

  const saveUserTargetsMutation = api.data.incentives?.setUserTargets as any;
  const saveIncentiveConfigMutation = api.data.incentives?.setIncentiveConfig as any;
  const setUserTargets = useMutation(saveUserTargetsMutation);
  const setIncentiveConfig = useMutation(saveIncentiveConfigMutation);
  // Base earnings mutations
  const createBaseEarningsMutation = api.data.incentives?.createBaseEarnings as any;
  const updateBaseEarningsMutation = api.data.incentives?.updateBaseEarnings as any;
  const createBaseEarnings = useMutation(createBaseEarningsMutation);
  const updateBaseEarnings = useMutation(updateBaseEarningsMutation);

  // Calculate loading states
  const isUserLoading = currentUser === undefined;
  const isDeliveriesLoading =
    allDeliveries === undefined || pendingDeliveries === undefined;
  const isStatsLoading =
    dailyStats === undefined ||
    performanceStats === undefined ||
    weeklyStats === undefined ||
    recentActivity === undefined;
  const isPickerOrdersLoading =
    (pickerOrders === undefined || pickerCompletedOrders === undefined) &&
    isPicker(currentUser?.roleName);
  const isIncentivesLoading =
    (isRider(currentUser?.roleName) && riderIncentives === undefined) ||
    (isPicker(currentUser?.roleName) && pickerIncentives === undefined);

  // Refresh function (Convex handles this automatically, but useful for manual triggers)
  const refreshData = () => {
    // Convex queries auto-refresh, but you can add custom logic here
    console.log("Data refresh triggered - Convex will handle automatically");
  };

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      currentUser,
      isUserLoading,
      allDeliveries: allDeliveries || [],
      pendingDeliveries: pendingDeliveries || [],
      isDeliveriesLoading,
      dailyStats,
      performanceStats,
      weeklyStats,
      recentActivity: recentActivity || [],
      isStatsLoading,
      pickerOrders: pickerOrders || [],
      pickerCompletedOrders: pickerCompletedOrders || [],
      isPickerOrdersLoading,
      riderIncentives,
      pickerIncentives,
      incentivesConfigRider,
      incentivesConfigPicker,
      isIncentivesLoading,
      riderBaseEarnings: riderIncentives?.baseEarnings,
      pickerBaseEarnings: pickerIncentives?.baseEarnings,
      riderRecommendations: riderIncentives?.recommendations || [],
      pickerRecommendations: pickerIncentives?.recommendations || [],
      saveUserTargets: async (
        role: "RIDER" | "PICKER",
        daily: number,
        weekly: number,
        monthly: number,
      ) => {
        if (!riderId) return;
        await setUserTargets({
          user_id: riderId as Id<"users">,
          role,
          daily_target: daily,
          weekly_target: weekly,
          monthly_target: monthly,
        });
      },
      saveIncentiveConfig: async (
        role: "RIDER" | "PICKER",
        thresholdDaily: number,
        bonusPerExtraDaily: number,
        currency?: string,
      ) => {
        await setIncentiveConfig({
          role,
          threshold_daily: thresholdDaily,
          bonus_per_extra_daily: bonusPerExtraDaily,
          currency,
          effective_from: Date.now(),
        });
      },
      applyRecommendedTargets: async (
        role: "RIDER" | "PICKER",
        targets: { daily: number; weekly: number; monthly: number },
      ) => {
        if (!riderId) return;
        await setUserTargets({
          user_id: riderId as Id<"users">,
          role,
          daily_target: targets.daily,
          weekly_target: targets.weekly,
          monthly_target: targets.monthly,
        });
      },
      saveBaseEarnings: async (
        role: "RIDER" | "PICKER",
        monthlyAmount: number,
        currency?: string,
      ) => {
        // Attempt to use existing dashboard base earnings to decide create vs update
        const existing =
          role === "RIDER"
            ? riderIncentives?.baseEarnings
            : pickerIncentives?.baseEarnings;
        if (existing) {
          await updateBaseEarnings({
            id: existing._id,
            monthly_base_amount: monthlyAmount,
            currency,
            effective_from: Date.now(),
          });
        } else {
          await createBaseEarnings({
            role,
            monthly_base_amount: monthlyAmount,
            currency,
            effective_from: Date.now(),
          });
        }
      },
      refreshData,
    }),
    [
      currentUser,
      isUserLoading,
      allDeliveries,
      pendingDeliveries,
      isDeliveriesLoading,
      dailyStats,
      performanceStats,
      weeklyStats,
      recentActivity,
      isStatsLoading,
      pickerOrders,
      pickerCompletedOrders,
      isPickerOrdersLoading,
      riderIncentives,
      pickerIncentives,
      incentivesConfigRider,
      incentivesConfigPicker,
      isIncentivesLoading,
      riderIncentives,
      pickerIncentives,
      riderIncentives?.baseEarnings,
      pickerIncentives?.baseEarnings,
    ],
  );

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
}

// Custom hook to use the data context
export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}

// Specialized hooks for specific data types
export function useUserData() {
  const { currentUser, isUserLoading } = useData();
  return { currentUser, isUserLoading };
}

export function useDeliveries() {
  const { allDeliveries, pendingDeliveries, isDeliveriesLoading } = useData();
  return { allDeliveries, pendingDeliveries, isDeliveriesLoading };
}

export function useRiderStats() {
  const {
    dailyStats,
    performanceStats,
    weeklyStats,
    recentActivity,
    isStatsLoading,
  } = useData();
  return {
    dailyStats,
    performanceStats,
    weeklyStats,
    recentActivity,
    isStatsLoading,
  };
}

export function usePickerOrders() {
  const { pickerOrders, pickerCompletedOrders, isPickerOrdersLoading } =
    useData();
  return { pickerOrders, pickerCompletedOrders, isPickerOrdersLoading };
}

export function useIncentivesData() {
  const {
    riderIncentives,
    pickerIncentives,
    incentivesConfigRider,
    incentivesConfigPicker,
    isIncentivesLoading,
    saveUserTargets,
    saveIncentiveConfig,
    applyRecommendedTargets,
  } = useData();
  return {
    riderIncentives,
    pickerIncentives,
    incentivesConfigRider,
    incentivesConfigPicker,
    isIncentivesLoading,
    saveUserTargets,
    saveIncentiveConfig,
    applyRecommendedTargets,
  };
}
