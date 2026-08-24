import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
} from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

interface TargetEditorModalProps {
  visible: boolean;
  onClose: () => void;
  initialDaily: number;
  initialWeekly: number;
  initialMonthly: number;
  saving: boolean;
  onSave: (d: number, w: number, m: number) => Promise<void>;
}

export const TargetEditorModal: React.FC<TargetEditorModalProps> = ({
  visible,
  onClose,
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
    if (visible) {
      setDaily(String(initialDaily));
      setWeekly(String(initialWeekly));
      setMonthly(String(initialMonthly));
    }
  }, [visible, initialDaily, initialWeekly, initialMonthly]);

  const handleSave = async () => {
    await onSave(Number(daily) || 0, Number(weekly) || 0, Number(monthly) || 0);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: THEME.colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 24,
            maxHeight: Dimensions.get("window").height * 0.8,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: THEME.colors.text,
              }}
            >
              Set My Targets
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: THEME.colors.surface,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="close" size={18} color={THEME.colors.text} />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontSize: 14,
              color: THEME.colors.textSecondary,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            Set personal targets higher than baseline to stay motivated and earn
            bonus rewards.
          </Text>

          {/* Input Fields */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.label}>Daily Target</Text>
              <TextInput
                value={daily}
                onChangeText={setDaily}
                keyboardType="numeric"
                style={styles.input}
                placeholder="Enter daily target"
                placeholderTextColor={THEME.colors.textSecondary}
              />
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={styles.label}>Weekly Target</Text>
              <TextInput
                value={weekly}
                onChangeText={setWeekly}
                keyboardType="numeric"
                style={styles.input}
                placeholder="Enter weekly target"
                placeholderTextColor={THEME.colors.textSecondary}
              />
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={styles.label}>Monthly Target</Text>
              <TextInput
                value={monthly}
                onChangeText={setMonthly}
                keyboardType="numeric"
                style={styles.input}
                placeholder="Enter monthly target"
                placeholderTextColor={THEME.colors.textSecondary}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={[styles.button, styles.cancelButton]}
              disabled={saving}
            >
              <Text style={[styles.buttonText, { color: THEME.colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.button, styles.saveButton]}
              disabled={saving}
            >
              <Text style={[styles.buttonText, { color: "#000" }]}>
                {saving ? "Saving..." : "Save Targets"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = {
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: THEME.colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    borderRadius: 12,
    color: THEME.colors.text,
    fontSize: 16,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cancelButton: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  saveButton: {
    backgroundColor: THEME.colors.primary,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700" as const,
  },
};
