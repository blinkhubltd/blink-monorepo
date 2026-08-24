import React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";

export const ProgressMetric: React.FC<{
  label: string;
  value: number;
  target: number;
}> = ({ label, value, target }) => {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "600" }}>{label}</Text>
        <Text style={{ fontWeight: "600" }}>
          {value} / {target}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: "#222",
          borderRadius: 4,
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        <View
          style={[
            { height: "100%", backgroundColor: THEME.colors.primary },
            { width: `${pct}%` },
          ]}
        />
      </View>
    </View>
  );
};
