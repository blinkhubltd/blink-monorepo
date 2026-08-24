import React, { useState, useEffect } from "react";
import { View, TextInput } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";

interface Props {
  role: "RIDER" | "PICKER";
  config: any | null;
  saving: boolean;
  onSave: (
    thresholdDaily: number,
    bonusPerExtraDaily: number,
    currency?: string
  ) => Promise<void>;
}
export const AdminConfigEditor: React.FC<Props> = ({
  role,
  config,
  saving,
  onSave,
}) => {
  const [thresholdDaily, setThresholdDaily] = useState(
    config ? String(config.threshold_daily) : ""
  );
  const [bonusPer, setBonusPer] = useState(
    config ? String(config.bonus_per_extra_daily) : ""
  );
  const [currency, setCurrency] = useState(config?.currency || "");

  useEffect(() => {
    if (config) {
      setThresholdDaily(String(config.threshold_daily));
      setBonusPer(String(config.bonus_per_extra_daily));
      setCurrency(config.currency || "");
    }
  }, [config]);

  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          color: THEME.colors.textSecondary,
          marginBottom: 8,
        }}
      >
        Configure baseline daily threshold and per-extra task bonus for{" "}
        {role.toLowerCase()}s.
      </Text>
      <Text>Daily Threshold</Text>
      <TextInput
        value={thresholdDaily}
        onChangeText={setThresholdDaily}
        keyboardType="numeric"
        style={styles.input}
        placeholder="e.g. 20"
        placeholderTextColor="#666"
      />
      <Text>Bonus Per Extra Task</Text>
      <TextInput
        value={bonusPer}
        onChangeText={setBonusPer}
        keyboardType="numeric"
        style={styles.input}
        placeholder="e.g. 0.50"
        placeholderTextColor="#666"
      />
      <Text>Currency (optional)</Text>
      <TextInput
        value={currency}
        onChangeText={setCurrency}
        style={styles.input}
        placeholder="USD"
        placeholderTextColor="#666"
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
                  Number(thresholdDaily) || 0,
                  Number(bonusPer) || 0,
                  currency || undefined
                );
              }
        }
      >
        <Text style={{ textAlign: "center", fontWeight: "700" }}>
          {saving ? "Saving..." : config ? "Update Config" : "Create Config"}
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
