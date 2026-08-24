import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import { formatKES } from "@/lib/currency";
import Ionicons from "@expo/vector-icons/Ionicons";

interface MyPlanCardProps {
  dailyTarget: number;
  weeklyTarget: number;
  monthlyTarget: number;
  dailyCurrent: number;
  weeklyCurrent: number;
  monthlyCurrent: number;
  projectedBonus?: number;
  onEditPlan: () => void;
}

const getProgressColor = (progress: number) => {
  if (progress >= 100) return "#4CAF50";
  if (progress >= 75) return THEME.colors.primary;
  if (progress >= 50) return "#FF9800";
  return "#F44336";
};

function PlanProgressItem({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const progress = target > 0 ? (current / target) * 100 : 0;
  const color = getProgressColor(progress);

  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons
          name="star-outline"
          size={14}
          color={THEME.colors.textSecondary}
        />
        <Text
          style={{
            fontSize: 12,
            color: THEME.colors.textSecondary,
            marginLeft: 4,
          }}
        >
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: "700", color }}>{current}</Text>
      <Text style={{ fontSize: 12, color: THEME.colors.textSecondary }}>
        of {target}
      </Text>
      <View
        style={{
          width: "100%",
          height: 4,
          backgroundColor: THEME.colors.background,
          borderRadius: 2,
          marginTop: 8,
        }}
      >
        <View
          style={{
            width: `${Math.min(progress, 100)}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

export const MyPlanCard: React.FC<MyPlanCardProps> = ({
  dailyTarget,
  weeklyTarget,
  monthlyTarget,
  dailyCurrent,
  weeklyCurrent,
  monthlyCurrent,
  projectedBonus,
  onEditPlan,
}) => {
  return (
    <View
      style={{
        backgroundColor: THEME.colors.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        marginBottom: 16,
        ...THEME.shadow.card,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 40,
              height: 40,
              backgroundColor: `${THEME.colors.primary}20`,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <Ionicons
              name="ribbon-outline"
              size={20}
              color={THEME.colors.primary}
            />
          </View>
          <View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: THEME.colors.text,
              }}
            >
              My Current Plan
            </Text>
            <Text style={{ fontSize: 12, color: THEME.colors.textSecondary }}>
              Active target goals
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onEditPlan}
          style={{
            backgroundColor: THEME.colors.background,
            padding: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: THEME.colors.border,
          }}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={THEME.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Progress Grid */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <PlanProgressItem
          label="Daily"
          current={dailyCurrent}
          target={dailyTarget}
        />
        <PlanProgressItem
          label="Weekly"
          current={weeklyCurrent}
          target={weeklyTarget}
        />
        <PlanProgressItem
          label="Monthly"
          current={monthlyCurrent}
          target={monthlyTarget}
        />
      </View>

      {/* Projected Bonus */}
      {projectedBonus && projectedBonus > 0 && (
        <View
          style={{
            backgroundColor: THEME.colors.background,
            padding: 12,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons
              name="trending-up-outline"
              size={16}
              color={THEME.colors.primary}
            />
            <Text
              style={{
                fontSize: 12,
                color: THEME.colors.textSecondary,
                marginLeft: 6,
              }}
            >
              Projected monthly bonus
            </Text>
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: THEME.colors.primary,
            }}
          >
            {formatKES(projectedBonus)}
          </Text>
        </View>
      )}
    </View>
  );
};
