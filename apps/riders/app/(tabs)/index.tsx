import React, { useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/lib/auth";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { formatKES } from "@/lib/currency";
import {
  useUserData,
  useRiderStats,
  useDeliveries,
  useIncentivesData,
} from "@/providers/DataProvider";
import { useTheme } from "@/theme/ThemeContext";
import { SkeletonBox } from "@/components/ui/SkeletonBox";
import { EmptyState } from "@/components/ui/EmptyState";

function HomeScreenSkeleton() {
  const theme = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          backgroundColor: theme.colors.surfaceSecondary,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 28,
          gap: 20,
        }}
      >
        <SkeletonBox width="50%" height={28} borderRadius={8} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, gap: 12 }}>
            <SkeletonBox width={32} height={32} borderRadius={16} />
            <SkeletonBox width="40%" height={28} borderRadius={6} />
            <SkeletonBox width="70%" height={12} borderRadius={4} />
          </View>
          <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, gap: 12 }}>
            <SkeletonBox width={32} height={32} borderRadius={16} />
            <SkeletonBox width="40%" height={28} borderRadius={6} />
            <SkeletonBox width="70%" height={12} borderRadius={4} />
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 16 }}>
        <SkeletonBox width="50%" height={18} borderRadius={6} />
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, gap: 12 }}>
          <SkeletonBox width="60%" height={14} borderRadius={6} />
          <SkeletonBox width="35%" height={11} borderRadius={5} />
          <SkeletonBox width="100%" height={40} borderRadius={10} />
        </View>
        <SkeletonBox width="40%" height={18} borderRadius={6} style={{ marginTop: 8 }} />
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, gap: 10 }}>
          <SkeletonBox width="100%" height={10} borderRadius={5} />
          <SkeletonBox width="100%" height={10} borderRadius={5} />
          <SkeletonBox width="100%" height={10} borderRadius={5} />
        </View>
      </View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { getUserDisplayName } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [showAllActivity, setShowAllActivity] = useState(false);

  const { currentUser, isUserLoading } = useUserData();
  const { dailyStats, recentActivity } = useRiderStats();
  const { pendingDeliveries } = useDeliveries();
  const { riderIncentives } = useIncentivesData();

  const riderId = currentUser?._id;

  const shiftStatus = useQuery(
    api.data.shift_utils.getUserShiftStatus,
    riderId ? { userId: riderId } : "skip",
  );

  const accountCompletion = useQuery(
    api.user.users.getAccountCompletionStatus,
    riderId ? { userId: riderId } : "skip",
  );

  const autoUpdateStatus = useMutation(api.data.shift_utils.autoUpdateStatusByShift);
  const disableOvertime = useMutation(api.data.shift_utils.disableOvertimeMode);

  const isOnline =
    currentUser?.rider_details?.status === "Active" ||
    currentUser?.rider_details?.status === "On Delivery";

  useEffect(() => {
    if (riderId && shiftStatus) {
      if (shiftStatus.status === "active" || shiftStatus.status === "starting_soon") {
        autoUpdateStatus({ userId: riderId });
      } else if (shiftStatus.status === "ended" && isOnline) {
        disableOvertime({ userId: riderId });
      }
    }
  }, [riderId, shiftStatus?.status]);

  const incentiveProgress = useMemo(() => {
    if (!riderIncentives) return null;
    const pct = (cur: number, tgt: number) => (tgt > 0 ? (cur / tgt) * 100 : 0);
    return {
      daily: { current: riderIncentives.todayDeliveries, target: riderIncentives.dailyTarget, progress: pct(riderIncentives.todayDeliveries, riderIncentives.dailyTarget) },
      weekly: { current: riderIncentives.weekDeliveries, target: riderIncentives.weeklyTarget, progress: pct(riderIncentives.weekDeliveries, riderIncentives.weeklyTarget) },
      monthly: { current: riderIncentives.monthDeliveries, target: riderIncentives.monthlyTarget, progress: pct(riderIncentives.monthDeliveries, riderIncentives.monthlyTarget) },
      todayBonus: riderIncentives.todayBonus || 0,
      projectedMonthlyBonus: riderIncentives.projectedMonthlyBonus || 0,
    };
  }, [riderIncentives]);

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return theme.colors.success;
    if (progress >= 75) return theme.colors.primary;
    if (progress >= 50) return theme.colors.warning;
    return "#F44336";
  };

  if (isUserLoading) return <HomeScreenSkeleton />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.TAB_BOTTOM_PADDING }}
        showsVerticalScrollIndicator={false}
      >
        <VStack style={{ flex: 1, gap: 20 }}>
          {/* Hero header */}
          <View
            style={{
              backgroundColor: theme.colors.surfaceSecondary,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 28,
              gap: 20,
              elevation: 2,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
            }}
          >
            {/* Greeting + status */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary, fontWeight: "500", marginBottom: 2 }}>
                  Welcome back,
                </Text>
                <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.text }}>
                  {getUserDisplayName()}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: isOnline ? theme.colors.success : theme.colors.textSecondary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  gap: 6,
                }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "white" }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "white" }}>
                  {isOnline ? "Active" : "Offline"}
                </Text>
              </View>
            </View>

            {/* Shift card */}
            {shiftStatus && (
              <TouchableOpacity onPress={() => router.push("/shift")} activeOpacity={0.85}>
                <View
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor:
                        shiftStatus.status === "active" || shiftStatus.status === "starting_soon"
                          ? theme.colors.primary + "20"
                          : shiftStatus.status === "ended"
                          ? theme.colors.textSecondary + "20"
                          : theme.colors.warning + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={
                        shiftStatus.status === "active" || shiftStatus.status === "starting_soon"
                          ? theme.colors.primary
                          : shiftStatus.status === "ended"
                          ? theme.colors.textSecondary
                          : theme.colors.warning
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: 2 }}>
                      {shiftStatus.message}
                    </Text>
                    {shiftStatus.timeInfo && (
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                        Today: {shiftStatus.timeInfo}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}

            {/* Stats cards */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[
                { value: dailyStats?.active || 0, label: "Active Deliveries", icon: "cube-outline" },
                { value: dailyStats?.completedToday || 0, label: "Completed Today", icon: "checkmark-circle-outline" },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.primary + "12",
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: theme.colors.primary + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={stat.icon as any} size={16} color={theme.colors.primary} />
                  </View>
                  <Text style={{ fontSize: 26, fontWeight: "700", color: theme.colors.text }}>
                    {stat.value}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.primary, fontWeight: "500" }}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <VStack style={{ paddingHorizontal: 20, gap: 20 }}>
            {/* Account completion banner */}
            {accountCompletion && !accountCompletion.complete && (
              <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} activeOpacity={0.8}>
                <View
                  style={{
                    backgroundColor: theme.colors.warning + "12",
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.warning + "35",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: theme.colors.warning + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="warning-outline" size={20} color={theme.colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text }}>
                      Complete your account ({accountCompletion.percentage}%)
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                      Missing: {accountCompletion.missing.join(", ")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.warning} />
                </View>
              </TouchableOpacity>
            )}

            {/* Current delivery */}
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
                  Current Delivery
                </Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/deliveries")}>
                  <Text style={{ fontSize: 14, color: theme.colors.primary, fontWeight: "600" }}>
                    View All
                  </Text>
                </TouchableOpacity>
              </View>

              {pendingDeliveries && pendingDeliveries.length > 0 ? (
                <TouchableOpacity
                  onPress={() => router.push(`/delivery-details?id=${pendingDeliveries[0]._id}`)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 18,
                    padding: 18,
                    ...theme.shadow.card,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + "20",
                    gap: 14,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text, marginBottom: 6 }}>
                        #{pendingDeliveries[0].order_ref?.slice(-6) || "Active Delivery"}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="person-outline" size={14} color={theme.colors.textSecondary} />
                        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                          {pendingDeliveries[0].customer_name || "Customer"}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        backgroundColor: theme.colors.primary + "15",
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.primary }}>
                        In Progress
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      backgroundColor: theme.colors.primary + "08",
                      padding: 12,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
                    <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: "600", flex: 1 }}>
                      Tap to view delivery details & directions
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <EmptyState
                  icon="cube-outline"
                  title="No Active Deliveries"
                  subtitle="New orders will appear here when assigned to you."
                />
              )}
            </View>

            {/* Incentive progress */}
            {incentiveProgress && (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
                      Your Progress
                    </Text>
                    <View
                      style={{
                        backgroundColor: theme.colors.primary + "15",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.primary, letterSpacing: 0.5 }}>
                        TARGETS
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => router.push("/(tabs)/incentives")}>
                    <Text style={{ fontSize: 14, color: theme.colors.primary, fontWeight: "600" }}>
                      View All
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 18,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    ...theme.shadow.card,
                    gap: 18,
                  }}
                >
                  {/* Progress bars */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {[
                      { label: "Daily", ...incentiveProgress.daily },
                      { label: "Weekly", ...incentiveProgress.weekly },
                      { label: "Monthly", ...incentiveProgress.monthly },
                    ].map((item) => (
                      <View key={item.label} style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.textSecondary }}>
                            {item.label}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: "600", color: theme.colors.textSecondary }}>
                            {Math.round(item.progress)}%
                          </Text>
                        </View>
                        <View
                          style={{
                            height: 7,
                            backgroundColor: theme.colors.surfaceSecondary,
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${Math.min(item.progress, 100)}%`,
                              height: "100%",
                              backgroundColor: getProgressColor(item.progress),
                              borderRadius: 4,
                            }}
                          />
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.text }}>
                          {item.current} of {item.target}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Bonus summary */}
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {[
                      { label: "Today", value: incentiveProgress.todayBonus, color: theme.colors.success, icon: "flash-outline" },
                      { label: "Projected", value: incentiveProgress.projectedMonthlyBonus, color: theme.colors.primary, icon: "trending-up-outline" },
                    ].map((item) => (
                      <View
                        key={item.label}
                        style={{
                          flex: 1,
                          backgroundColor: item.color + "10",
                          padding: 14,
                          borderRadius: 14,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Ionicons name={item.icon as any} size={13} color={item.color} />
                          <Text style={{ fontSize: 10, color: item.color, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
                            {item.label}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: item.color }}>
                          {formatKES(item.value)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Quick Actions */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>Quick Actions</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {[
                  {
                    label: "Deliveries",
                    icon: "cube-outline",
                    badge: `${pendingDeliveries?.length || 0} pending`,
                    color: theme.colors.primary,
                    route: "/(tabs)/deliveries",
                  },
                  {
                    label: "Incentives",
                    icon: "medal-outline",
                    badge: "View targets",
                    color: theme.colors.success,
                    route: "/(tabs)/incentives",
                  },
                ].map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    onPress={() => router.push(action.route as any)}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 14,
                      padding: 18,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        backgroundColor: action.color + "15",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={action.icon as any} size={22} color={action.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.text }}>
                      {action.label}
                    </Text>
                    <View
                      style={{
                        backgroundColor: action.color + "15",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 7,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "600", color: action.color }}>
                        {action.badge}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Recent Activity */}
            {recentActivity && recentActivity.length > 0 && (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
                    Recent Activity
                  </Text>
                  {recentActivity.length > 3 && (
                    <TouchableOpacity onPress={() => setShowAllActivity(!showAllActivity)}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ fontSize: 14, color: theme.colors.primary, fontWeight: "600" }}>
                          {showAllActivity ? "Show Less" : "View All"}
                        </Text>
                        <Ionicons
                          name={showAllActivity ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={theme.colors.primary}
                        />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ gap: 10 }}>
                  {(showAllActivity ? recentActivity : recentActivity.slice(0, 3)).map((r: any) => (
                    <View
                      key={String(r._id)}
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 14,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: theme.colors.success + "15",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 2 }}>
                          #{r.order_ref?.slice(-6) || "Delivery Completed"}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.text }}>
                          {r.customer_name || "Customer"}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: theme.colors.success + "10",
                          paddingHorizontal: 9,
                          paddingVertical: 3,
                          borderRadius: 7,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.success, textTransform: "uppercase" }}>
                          {r.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
