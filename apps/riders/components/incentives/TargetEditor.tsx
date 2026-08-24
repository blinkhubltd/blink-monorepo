import React, { useState, useEffect } from "react";
import { View, TextInput } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";

interface Props {
  initialDaily: number;
  initialWeekly: number;
  initialMonthly: number;
  saving: boolean;
  onSave: (d: number, w: number, m: number) => Promise<void>;
}
export const TargetEditor: React.FC<Props> = ({
  initialDaily,
  initialWeekly,
  initialMonthly,
  saving,
  onSave,
}) => {
  const [daily, setDaily] = useState(String(initialDaily));
  const [weekly, setWeekly] = useState(String(initialWeekly));
  const [monthly, setMonthly] = useState(String(initialMonthly));
  useEffect(() => {
    setDaily(String(initialDaily));
  }, [initialDaily]);
  useEffect(() => {
    setWeekly(String(initialWeekly));
  }, [initialWeekly]);
  useEffect(() => {
    setMonthly(String(initialMonthly));
  }, [initialMonthly]);
  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          color: THEME.colors.textSecondary,
          marginBottom: 8,
        }}
      >
        Set personal targets (higher than baseline for bonuses motivation).
      </Text>
      <Text>Daily</Text>
      <TextInput
        value={daily}
        onChangeText={setDaily}
        keyboardType="numeric"
        style={styles.input}
      />
      <Text>Weekly</Text>
      <TextInput
        value={weekly}
        onChangeText={setWeekly}
        keyboardType="numeric"
        style={styles.input}
      />
      <Text>Monthly</Text>
      <TextInput
        value={monthly}
        onChangeText={setMonthly}
        keyboardType="numeric"
        style={styles.input}
      />
      <View
        style={{
          backgroundColor: THEME.colors.primary,
          padding: 12,
          borderRadius: 8,
          opacity: saving ? 0.6 : 1,
          marginTop: 4,
        }}
        onTouchEnd={
          saving
            ? undefined
            : async () => {
                await onSave(
                  Number(daily) || 0,
                  Number(weekly) || 0,
                  Number(monthly) || 0
                );
              }
        }
      >
        <Text style={{ textAlign: "center", fontWeight: "700" }}>
          {saving ? "Saving..." : "Save Targets"}
        </Text>
      </View>
    </View>
  );
};
const styles = {
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    color: "#fff",
  },
};
