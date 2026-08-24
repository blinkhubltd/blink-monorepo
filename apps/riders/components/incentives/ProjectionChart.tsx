import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

interface ProjectionChartProps {
  data: {
    label: string;
    current: number;
    projected: number;
    target?: number;
  }[];
  height?: number;
  showCurrency?: boolean;
  type?: "bar" | "line";
}

type TabKey = "overview" | "pace";

export const ProjectionChart: React.FC<ProjectionChartProps> = ({
  data,
  height = 220,
  showCurrency = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Progress" },
    { key: "pace", label: "Pace" },
  ];

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "overview" ? (
        <OverviewTab data={data} showCurrency={showCurrency} />
      ) : (
        <PaceTab data={data} />
      )}
    </View>
  );
};

/* ─── Overview Tab ─── */
function OverviewTab({
  data,
  showCurrency,
}: {
  data: ProjectionChartProps["data"];
  showCurrency: boolean;
}) {
  return (
    <View style={styles.overviewContainer}>
      {data.map((item, index) => {
        const target = item.target || 0;
        const pct =
          target > 0 ? Math.min((item.current / target) * 100, 100) : 0;
        const projPct =
          target > 0 ? Math.min((item.projected / target) * 100, 150) : 0;
        const isOnTrack = target > 0 && item.current >= target * 0.7;
        const isCompleted = target > 0 && item.current >= target;

        return (
          <View
            key={item.label}
            style={[
              styles.progressItem,
              index < data.length - 1 && styles.progressItemBorder,
            ]}
          >
            {/* Label row */}
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{item.label}</Text>
              <Text style={styles.progressValues}>
                {item.current}
                {target > 0 ? (
                  <Text style={styles.progressTarget}>{` / ${target}`}</Text>
                ) : null}
              </Text>
            </View>

            {/* Progress bar */}
            <View style={styles.barContainer}>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: isCompleted
                        ? THEME.colors.success
                        : isOnTrack
                          ? THEME.colors.info
                          : THEME.colors.warning,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.pctText,
                  {
                    color: isCompleted
                      ? THEME.colors.success
                      : isOnTrack
                        ? THEME.colors.info
                        : THEME.colors.warning,
                  },
                ]}
              >
                {Math.round(pct)}%
              </Text>
            </View>

            {/* Projected row */}
            {target > 0 && (
              <View style={styles.projectedRow}>
                <Text style={styles.projectedLabel}>{"Projected: "}</Text>
                <Text
                  style={[
                    styles.projectedValue,
                    {
                      color:
                        item.projected >= target
                          ? THEME.colors.success
                          : THEME.colors.warning,
                    },
                  ]}
                >
                  {Math.round(item.projected)}
                </Text>
                {item.projected >= target ? (
                  <Ionicons name="trending-up-outline" size={12} color={THEME.colors.success} style={{ marginLeft: 4 }} />
                ) : (
                  <Ionicons name="trending-down-outline" size={12} color={THEME.colors.warning} style={{ marginLeft: 4 }} />
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ─── Pace Tab ─── */
function PaceTab({ data }: { data: ProjectionChartProps["data"] }) {
  const periodDays: Record<string, { total: number; elapsed: number }> = {
    Daily: { total: 1, elapsed: 1 },
    Weekly: { total: 6, elapsed: Math.min(new Date().getDay() + 1, 6) },
    Monthly: {
      total: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      ).getDate(),
      elapsed: new Date().getDate(),
    },
  };

  return (
    <View style={styles.paceContainer}>
      {data.map((item) => {
        const target = item.target || 0;
        const pd = periodDays[item.label] || { total: 1, elapsed: 1 };
        const expectedByNow = target > 0 ? (target / pd.total) * pd.elapsed : 0;
        const isAhead = item.current >= expectedByNow;
        const remaining = Math.max(target - item.current, 0);
        const remainingDays = Math.max(pd.total - pd.elapsed, 1);
        const requiredPerDay =
          remaining > 0 ? (remaining / remainingDays).toFixed(1) : "0";

        let status: "ahead" | "behind" | "onTrack" = "onTrack";
        if (target === 0) status = "onTrack";
        else if (item.current >= target) status = "ahead";
        else if (isAhead) status = "ahead";
        else status = "behind";

        const statusConfig = {
          ahead: {
            color: THEME.colors.success,
            iconName: "trending-up-outline",
            label: "On Track",
          },
          behind: {
            color: THEME.colors.warning,
            iconName: "trending-down-outline",
            label: "Behind Pace",
          },
          onTrack: {
            color: THEME.colors.info,
            iconName: "remove-outline",
            label: "No Target",
          },
        }[status];

        return (
          <View key={item.label} style={styles.paceCard}>
            <View style={styles.paceCardHeader}>
              <Text style={styles.paceCardTitle}>{item.label}</Text>
              <View
                style={[
                  styles.paceBadge,
                  { backgroundColor: `${statusConfig.color}15` },
                ]}
              >
                <Ionicons name={statusConfig.iconName as any} size={12} color={statusConfig.color} />
                <Text
                  style={[styles.paceBadgeText, { color: statusConfig.color }]}
                >
                  {statusConfig.label}
                </Text>
              </View>
            </View>

            <View style={styles.paceStats}>
              <View style={styles.paceStat}>
                <Text style={styles.paceStatValue}>{item.current}</Text>
                <Text style={styles.paceStatLabel}>{"Done"}</Text>
              </View>
              <View style={styles.paceStatDivider} />
              <View style={styles.paceStat}>
                <Text style={styles.paceStatValue}>{remaining}</Text>
                <Text style={styles.paceStatLabel}>{"Remaining"}</Text>
              </View>
              <View style={styles.paceStatDivider} />
              <View style={styles.paceStat}>
                <Text style={styles.paceStatValue}>{requiredPerDay}</Text>
                <Text style={styles.paceStatLabel}>{"Needed/day"}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: THEME.colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.text,
  },

  /* Overview */
  overviewContainer: {
    gap: 0,
  },
  progressItem: {
    paddingVertical: 12,
  },
  progressItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border + "30",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
  },
  progressValues: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  progressTarget: {
    fontWeight: "500",
    color: THEME.colors.textSecondary,
  },
  barContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  barBackground: {
    flex: 1,
    height: 8,
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  pctText: {
    fontSize: 12,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },
  projectedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  projectedLabel: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  projectedValue: {
    fontSize: 11,
    fontWeight: "700",
  },

  /* Pace */
  paceContainer: {
    gap: 10,
  },
  paceCard: {
    backgroundColor: THEME.colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
  },
  paceCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  paceCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  paceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  paceBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  paceStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  paceStat: {
    flex: 1,
    alignItems: "center",
  },
  paceStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
    marginBottom: 2,
  },
  paceStatLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  paceStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: THEME.colors.border,
  },
});
