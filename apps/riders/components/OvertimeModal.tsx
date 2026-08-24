import React from "react";
import { Modal, View, TouchableOpacity } from "react-native";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

interface OvertimeModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  shiftEndTime?: string;
}

export const OvertimeModal: React.FC<OvertimeModalProps> = ({
  visible,
  onAccept,
  onDecline,
  shiftEndTime,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: THEME.colors.surface,
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 400,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <VStack style={{ gap: 20 }}>
            {/* Icon */}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: THEME.colors.warning + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="time-outline" size={32} color={THEME.colors.warning} />
              </View>
            </View>

            {/* Title & Message */}
            <VStack style={{ gap: 8, alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: THEME.colors.text,
                  textAlign: "center",
                }}
              >
                Your Shift Has Ended
              </Text>
              {shiftEndTime && (
                <Text
                  style={{
                    fontSize: 14,
                    color: THEME.colors.textSecondary,
                    textAlign: "center",
                  }}
                >
                  Your scheduled shift ended at {shiftEndTime}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 16,
                  color: THEME.colors.text,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                Would you like to continue working overtime?
              </Text>
            </VStack>

            {/* Actions */}
            <VStack style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={onAccept}
                style={{
                  backgroundColor: THEME.colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: "white",
                  }}
                >
                  Yes, Continue Working
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDecline}
                style={{
                  backgroundColor: THEME.colors.background,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: THEME.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: THEME.colors.textSecondary,
                  }}
                >
                  No, Go Offline
                </Text>
              </TouchableOpacity>
            </VStack>
          </VStack>
        </View>
      </View>
    </Modal>
  );
};
