import React, { useState } from "react";
import { View, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { Button, ButtonText } from "@/components/ui/button";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { Text } from "@/components/ui/text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { THEME } from "@/theme/design";

interface PrescriptionRejectionSelectorProps {
  onSubmit: (rejectionReasonId?: string, customNotes?: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function PrescriptionRejectionSelector({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PrescriptionRejectionSelectorProps) {
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [customNotes, setCustomNotes] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const rejectionReasons = useQuery(
    api.data.prescription_rejection_reasons.getActiveRejectionReasons
  );

  const handleReasonSelect = (value: string) => {
    setSelectedReasonId(value);
    setShowCustomInput(value === "custom");
    if (value !== "custom") setCustomNotes("");
  };

  const handleSubmit = () => {
    if (!selectedReasonId) {
      Alert.alert("Required", "Please select a rejection reason");
      return;
    }
    if (selectedReasonId === "custom" && !customNotes.trim()) {
      Alert.alert("Required", "Please provide a custom rejection reason");
      return;
    }
    const reasonId = selectedReasonId === "custom" ? undefined : selectedReasonId;
    onSubmit(reasonId, customNotes.trim());
  };

  if (!rejectionReasons) {
    return (
      <View
        style={{
          padding: 24,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <ActivityIndicator size="small" color={THEME.colors.primary} />
        <Text style={{ color: THEME.colors.textSecondary, fontSize: 14 }}>
          Loading rejection reasons...
        </Text>
      </View>
    );
  }

  const RadioRow = ({
    id,
    title,
    description,
  }: {
    id: string;
    title: string;
    description?: string;
  }) => {
    const isSelected = selectedReasonId === id;
    return (
      <TouchableOpacity
        key={id}
        onPress={() => handleReasonSelect(id)}
        activeOpacity={0.75}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isSelected ? THEME.colors.primary + "60" : THEME.colors.border,
          backgroundColor: isSelected
            ? THEME.colors.primary + "08"
            : THEME.colors.surface,
          gap: 12,
          marginBottom: 8,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: isSelected ? THEME.colors.primary : THEME.colors.border,
            backgroundColor: isSelected ? THEME.colors.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontWeight: "600",
              color: THEME.colors.text,
              fontSize: 14,
              marginBottom: description ? 4 : 0,
            }}
          >
            {title}
          </Text>
          {description && (
            <Text
              style={{
                fontSize: 13,
                color: THEME.colors.textSecondary,
                lineHeight: 18,
              }}
            >
              {description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: THEME.colors.background }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: THEME.colors.text,
            }}
          >
            Select Rejection Reason
          </Text>
          <Text style={{ fontSize: 13, color: THEME.colors.textSecondary }}>
            Please select the reason why this prescription cannot be approved:
          </Text>
        </View>

        <View>
          {rejectionReasons.map((reason: any) => (
            <RadioRow
              key={reason._id}
              id={reason._id}
              title={reason.title}
              description={reason.description}
            />
          ))}
          <RadioRow id="custom" title="Other (specify custom reason)" />
        </View>

        {showCustomInput && (
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontWeight: "600",
                color: THEME.colors.text,
                fontSize: 14,
              }}
            >
              Custom Rejection Reason
            </Text>
            <Textarea>
              <TextareaInput
                placeholder="Please provide a detailed reason for rejecting this prescription..."
                value={customNotes}
                onChangeText={setCustomNotes}
                style={{
                  color: THEME.colors.text,
                  minHeight: 100,
                  textAlignVertical: "top",
                }}
              />
            </Textarea>
          </View>
        )}

        {selectedReasonId && selectedReasonId !== "custom" && (
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontWeight: "600",
                color: THEME.colors.text,
                fontSize: 14,
              }}
            >
              Additional Notes{" "}
              <Text style={{ color: THEME.colors.textSecondary, fontWeight: "400" }}>
                (Optional)
              </Text>
            </Text>
            <Textarea>
              <TextareaInput
                placeholder="Add any additional details about the rejection..."
                value={customNotes}
                onChangeText={setCustomNotes}
                style={{
                  color: THEME.colors.text,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
              />
            </Textarea>
          </View>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Button
            variant="outline"
            style={{ flex: 1 }}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <ButtonText>Cancel</ButtonText>
          </Button>

          <Button
            style={{
              flex: 1,
              backgroundColor: isSubmitting ? THEME.colors.error + "80" : THEME.colors.error,
            }}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <ButtonText style={{ color: "#fff" }}>
              {isSubmitting ? "Rejecting..." : "Reject Prescription"}
            </ButtonText>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
