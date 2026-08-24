import React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface PaceData {
  requiredPerDay: number;
  onTrack: boolean;
}
export const PaceIndicator: React.FC<{
  label: string;
  remaining: number;
  pace: PaceData;
}> = ({ label, remaining, pace }) => {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: "600" }}>
        {label} Remaining: {remaining}
      </Text>
      <Text style={{ fontSize: 12 }}>
        Needed per day: {pace.requiredPerDay.toFixed(1)}
      </Text>
      <Text style={{ fontSize: 12, color: pace.onTrack ? "lime" : "orange" }}>
        On Track: {pace.onTrack ? "Yes" : "No"}
      </Text>
    </View>
  );
};
