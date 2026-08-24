import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import { formatKES } from "@/lib/currency";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  isCurrency?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  onPress,
  icon,
  isCurrency = false,
}) => {
  const displayValue =
    isCurrency && typeof value === "number"
      ? formatKES(value)
      : value.toString();

  const trendColor =
    trend === "up"
      ? "#4CAF50"
      : trend === "down"
        ? "#F44336"
        : THEME.colors.textSecondary;

  const CardComponent = onPress ? TouchableOpacity : View;

  return (
    <CardComponent
      onPress={onPress}
      style={{
        backgroundColor: THEME.colors.surface,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        minHeight: 100,
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12,
              color: THEME.colors.textSecondary,
              marginBottom: 4,
              fontWeight: "500",
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: THEME.colors.text,
              marginBottom: 4,
            }}
          >
            {displayValue}
          </Text>
          {subtitle && (
            <Text
              style={{
                fontSize: 11,
                color: THEME.colors.textSecondary,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {icon && (
          <View
            style={{
              width: 30,
              height: 30,
              backgroundColor: `${THEME.colors.primary}20`,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {icon}
          </View>
        )}
      </View>

      {trend && trendValue && (
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}
        >
          <Text
            style={{
              fontSize: 11,
              color: trendColor,
              fontWeight: "600",
            }}
          >
            {trend === "up" ? "↗ " : trend === "down" ? "↙ " : "→ "}
            {trendValue}
          </Text>
        </View>
      )}
    </CardComponent>
  );
};
