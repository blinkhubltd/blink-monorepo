import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useData } from "@/providers/DataProvider";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/ThemeContext";
import { formatKES } from "@/lib/currency";
import { WORKING_DAYS_CONFIG } from "@/lib/workingDays";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  IncentiveCard,
  IncentiveSkeleton,
  ProgressChart,
  ProjectionChart,
  StatsCard,
  TargetEditorModal,
  AdminConfigEditor,
  RecommendationsModal,
  MyPlanCard,
} from "@/components/incentives";
import { EmptyState } from "@/components/ui/EmptyState";

export default function RiderIncentivesScreen() {
  const { userId } = useAuth();
  const theme = useTheme();
  const {
    currentUser: user,
    riderIncentives: dashboard,
    incentivesConfigRider: config,
    saveUserTargets,
    saveIncentiveConfig,
    riderBaseEarnings,
    riderRecommendations,
    applyRecommendedTargets,
    isIncentivesLoading,
    isUserLoading,
    refreshData,
  } = useData();

  const [savingTargets, setSavingTargets] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [recommendationsModalVisible, setRecommendationsModalVisible] =
    useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  // Stop spinner once data finishes loading
  useEffect(() => {
    if (!isIncentivesLoading && refreshing) {
      setRefreshing(false);
    }
  }, [isIncentivesLoading, refreshing]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshData();
  }, [refreshData]);

  const hasActivePlan =
    dashboard &&
    (dashboard.targets.daily > 0 ||
      dashboard.targets.weekly > 0 ||
      dashboard.targets.monthly > 0);

  const handleApplyRecommendedPlan = async (targets: {
    daily: number;
    weekly: number;
    monthly: number;
  }) => {
    setSavingTargets(true);
    try {
      await applyRecommendedTargets("RIDER", targets);
      setRecommendationsModalVisible(false);
    } finally {
      setSavingTargets(false);
    }
  };

  // Loading state
  if (isUserLoading || isIncentivesLoading) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + theme.TAB_BOTTOM_PADDING,
        }}
      >
        <IncentiveSkeleton title="Performance Dashboard" />
        <IncentiveSkeleton title="Progress Charts" lines={4} />
        <IncentiveSkeleton title="Earnings Summary" lines={2} />
        <IncentiveSkeleton title="Target Settings" lines={3} />
      </ScrollView>
    );
  }

  // Error / no data state
  if (!user || dashboard === null) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + theme.TAB_BOTTOM_PADDING,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        <EmptyState
          icon="alert-circle-outline"
          title="Failed to load incentives"
          subtitle="Pull down to refresh or try again later."
          error
        />
      </ScrollView>
    );
  }

  // Chart data
  const chartData = [
    {
      label: "Daily",
      current: dashboard.counts.daily,
      projected:
        dashboard.advanced?.dailyAverage * WORKING_DAYS_CONFIG.MONTHLY ||
        dashboard.counts.daily,
      target: dashboard.targets.daily,
    },
    {
      label: "Weekly",
      current: dashboard.counts.weekly,
      projected: WORKING_DAYS_CONFIG.getMonthlyProjectionFromWeekly(
        dashboard.counts.weekly,
      ),
      target: dashboard.targets.weekly,
    },
    {
      label: "Monthly",
      current: dashboard.counts.monthly,
      projected:
        dashboard.advanced?.projectedMonthly || dashboard.counts.monthly,
      target: dashboard.targets.monthly,
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        paddingTop: 16,
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + theme.TAB_BOTTOM_PADDING,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: theme.colors.text,
            marginBottom: 4,
          }}
        >
          Performance Dashboard
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
          Track your progress and earnings
        </Text>
      </View>

      {/* Quick Stats Grid */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <StatsCard
            title="Today's Progress"
            value={dashboard.counts.daily}
            subtitle={`Target: ${dashboard.targets.daily}`}
            trend={
              dashboard.counts.daily >= dashboard.targets.daily
                ? "up"
                : "neutral"
            }
            trendValue={`${dashboard.targets.daily > 0 ? Math.round((dashboard.counts.daily / dashboard.targets.daily) * 100) : 0}%`}
            icon={
              <Ionicons
                name="trending-up-outline"
                size={20}
                color={theme.colors.primary}
              />
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <StatsCard
            title="Estimated Bonus"
            value={dashboard.bonus.bonus}
            subtitle={`Extra tasks: ${dashboard.bonus.extraTasks}`}
            trend="up"
            trendValue={`${formatKES(dashboard.bonus.bonus)}`}
            icon={
              <Ionicons
                name="gift-outline"
                size={20}
                color={theme.colors.primary}
              />
            }
            isCurrency={true}
          />
        </View>
      </View>

      {/* No plan empty state */}
      {!hasActivePlan && (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 16,
            ...theme.shadow.card,
          }}
        >
          <EmptyState
            icon="radio-button-on-outline"
            title="No targets set yet"
            subtitle="Set daily, weekly and monthly delivery targets to track your progress and unlock bonuses."
            action={{
              label: "Set My First Target",
              onPress: () => setTargetModalVisible(true),
            }}
          />
        </View>
      )}

      {/* My Plan */}
      {hasActivePlan && (
        <MyPlanCard
          dailyTarget={dashboard.targets.daily}
          weeklyTarget={dashboard.targets.weekly}
          monthlyTarget={dashboard.targets.monthly}
          dailyCurrent={dashboard.counts.daily}
          weeklyCurrent={dashboard.counts.weekly}
          monthlyCurrent={dashboard.counts.monthly}
          projectedBonus={dashboard.bonus.bonus}
          onEditPlan={() => setTargetModalVisible(true)}
        />
      )}

      {/* Progress Charts */}
      <IncentiveCard title="Progress Overview">
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            marginVertical: 8,
          }}
        >
          <ProgressChart
            value={dashboard.counts.daily}
            target={dashboard.targets.daily}
            label="Daily"
            size={100}
          />
          <ProgressChart
            value={dashboard.counts.weekly}
            target={dashboard.targets.weekly}
            label="Weekly"
            size={100}
          />
          <ProgressChart
            value={dashboard.counts.monthly}
            target={dashboard.targets.monthly}
            label="Monthly"
            size={100}
          />
        </View>
      </IncentiveCard>

      {/* Performance Trends */}
      <IncentiveCard title="Performance Trends">
        <ProjectionChart data={chartData} height={220} type="line" />
      </IncentiveCard>

      {/* Earnings Summary */}
      <IncentiveCard title="Earnings Summary">
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                marginBottom: 4,
              }}
            >
              Base Monthly
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.colors.text,
              }}
            >
              {riderBaseEarnings
                ? formatKES(riderBaseEarnings.monthly_base_amount)
                : "N/A"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                marginBottom: 4,
              }}
            >
              Bonus Earned
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.colors.primary,
              }}
            >
              {formatKES(dashboard.bonus.bonus)}
            </Text>
          </View>
        </View>

        {config && (
          <View
            style={{
              backgroundColor: theme.colors.surfaceSecondary,
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                marginBottom: 4,
              }}
            >
              Bonus Structure
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              Daily baseline: {config.threshold_daily} tasks
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              Bonus per extra task: {formatKES(config.bonus_per_extra_daily)}
            </Text>
          </View>
        )}
      </IncentiveCard>

      {/* Advanced Analytics */}
      {dashboard.advanced && (
        <IncentiveCard title="Advanced Analytics">
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <View style={{ width: "48%", marginBottom: 12 }}>
              <Text
                style={{ fontSize: 12, color: theme.colors.textSecondary }}
              >
                Daily Average
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                }}
              >
                {dashboard.advanced.dailyAverage.toFixed(1)}
              </Text>
            </View>
            <View style={{ width: "48%", marginBottom: 12 }}>
              <Text
                style={{ fontSize: 12, color: theme.colors.textSecondary }}
              >
                Projected Monthly
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                }}
              >
                {Math.round(dashboard.advanced.projectedMonthly)}
              </Text>
            </View>
            <View style={{ width: "100%" }}>
              <Text
                style={{ fontSize: 12, color: theme.colors.textSecondary }}
              >
                Month Progress
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                }}
              >
                {dashboard.advanced.daysElapsedInMonth} of{" "}
                {dashboard.advanced.daysInMonth} days
              </Text>
            </View>
          </View>
        </IncentiveCard>
      )}

      {/* Action Buttons */}
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <TouchableOpacity
          onPress={() => setTargetModalVisible(true)}
          activeOpacity={0.8}
          style={{
            flex: 1,
            backgroundColor: theme.colors.primary,
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="rocket-outline" size={20} color="#000" />
          <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
            Set Targets
          </Text>
        </TouchableOpacity>

        {riderRecommendations && riderRecommendations.length > 0 && (
          <TouchableOpacity
            onPress={() => setRecommendationsModalVisible(true)}
            activeOpacity={0.8}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              gap: 8,
            }}
          >
            <Ionicons
              name="flash-outline"
              size={20}
              color={theme.colors.primary}
            />
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "700",
                fontSize: 15,
              }}
            >
              AI Plans
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Admin Configuration */}
      {user.roleName?.toLowerCase() === "admin" && (
        <IncentiveCard title="Admin Configuration">
          <AdminConfigEditor
            role="RIDER"
            config={config}
            saving={savingConfig}
            onSave={async (thresholdDaily, bonusPerExtraDaily) => {
              setSavingConfig(true);
              try {
                await saveIncentiveConfig(
                  "RIDER",
                  thresholdDaily,
                  bonusPerExtraDaily,
                );
              } finally {
                setSavingConfig(false);
              }
            }}
          />
        </IncentiveCard>
      )}

      <TargetEditorModal
        visible={targetModalVisible}
        onClose={() => setTargetModalVisible(false)}
        initialDaily={dashboard.targets.daily}
        initialWeekly={dashboard.targets.weekly}
        initialMonthly={dashboard.targets.monthly}
        saving={savingTargets}
        onSave={async (d, w, m) => {
          if (!user) return;
          setSavingTargets(true);
          try {
            await saveUserTargets("RIDER", d, w, m);
          } finally {
            setSavingTargets(false);
          }
        }}
      />

      {riderRecommendations && (
        <RecommendationsModal
          visible={recommendationsModalVisible}
          onClose={() => setRecommendationsModalVisible(false)}
          recommendations={riderRecommendations}
          saving={savingTargets}
          onApplyPlan={handleApplyRecommendedPlan}
          onSaveCustomPlan={async (d, w, m) => {
            if (!user) return;
            setSavingTargets(true);
            try {
              await saveUserTargets("RIDER", d, w, m);
            } finally {
              setSavingTargets(false);
            }
          }}
        />
      )}
    </ScrollView>
  );
}
