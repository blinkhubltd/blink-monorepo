import React from "react";
import { View } from "react-native";
import { ProgressChart as ChartKitProgressChart } from "react-native-chart-kit";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";

interface ProgressChartProps {
  value: number;
  target: number;
  label: string;
  size?: number;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({
  value,
  target,
  label,
  size = 120,
}) => {
  const progress = target > 0 ? Math.min(value / target, 1) : 0;
  const percentage = Math.round(progress * 100);

  const data = {
    labels: [label],
    data: [progress],
  };

  const chartConfig = {
    backgroundGradientFrom: THEME.colors.surface,
    backgroundGradientTo: THEME.colors.surface,
    color: (opacity = 1) => `rgba(255, 193, 7, ${opacity})`, // THEME.colors.primary with opacity
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
  };

  return (
    <View style={{ alignItems: "center", marginVertical: 8 }}>
      <View style={{ position: "relative" }}>
        <ChartKitProgressChart
          data={data}
          width={size}
          height={size}
          strokeWidth={8}
          radius={size / 3}
          chartConfig={chartConfig}
          hideLegend={true}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: THEME.colors.primary,
            }}
          >
            {percentage}%
          </Text>
          <Text style={{ fontSize: 10, color: THEME.colors.textSecondary }}>
            {value}/{target}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
};
