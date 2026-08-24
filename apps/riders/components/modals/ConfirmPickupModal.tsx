import React from "react";
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Button, ButtonText } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface ConfirmPickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: {
    _id: string;
    name: string;
    quantity: number;
    unit_type?: string;
    unit_value?: number;
  }[];
  onConfirm: () => void;
}

export function ConfirmPickupModal({
  isOpen,
  onClose,
  items = [], // fallback to empty array to prevent map crash
  onConfirm,
}: ConfirmPickupModalProps) {
  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Modal Content */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: THEME.colors.surface,
            borderRadius: 20,
            maxWidth: 450,
            width: screenWidth - 40,
            maxHeight: screenHeight * 0.8,
            borderWidth: 1,
            borderColor: THEME.colors.border,
            ...THEME.shadow.card,
          }}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderBottomColor: THEME.colors.border + "20",
            }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <VStack space="xs" style={{ marginRight: 20 }}>
                <Heading size="lg" style={{ color: THEME.colors.text }}>
                  Confirm Pickup
                </Heading>
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 14,
                  }}
                >
                  Review the items before marking as picked up
                </Text>
              </VStack>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: THEME.colors.surfaceSecondary,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
              </TouchableOpacity>
            </HStack>
          </View>

          {/* Body */}
          <ScrollView
            style={{ maxHeight: screenHeight * 0.55 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ padding: 20 }}>
              <VStack space="lg">
                {items.length === 0 ? (
                  <Text
                    style={{
                      fontSize: 15,
                      color: THEME.colors.textSecondary,
                      textAlign: "center",
                    }}
                  >
                    No items to confirm.
                  </Text>
                ) : (
                  items.map((item) => (
                    <HStack
                      key={item._id}
                      space="sm"
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={THEME.colors.primary} />
                      <Text
                        style={{
                          fontSize: 15,
                          color: THEME.colors.text,
                        }}
                      >
                        {item.name}{" "}
                        <Text
                          style={{
                            fontWeight: "600",
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          x{item.quantity}
                          {item.unit_value && item.unit_type && (
                            <Text>
                              {" "}
                              • {item.unit_value}
                              {item.unit_type}
                            </Text>
                          )}
                        </Text>
                      </Text>
                    </HStack>
                  ))
                )}
              </VStack>
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              padding: 20,
              borderTopWidth: 1,
              borderTopColor: THEME.colors.border + "20",
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <HStack space="md" style={{ flexDirection: "row", gap: 10 }}>
              <Button
                variant="outline"
                onPress={onClose}
                style={{
                  borderColor: THEME.colors.border,
                  backgroundColor: THEME.colors.surface,
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                }}
              >
                <ButtonText
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Cancel
                </ButtonText>
              </Button>

              <Button
                onPress={onConfirm}
                style={{
                  backgroundColor: THEME.colors.success || "#22C55E",
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                }}
              >
                <ButtonText
                  style={{
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Confirm
                </ButtonText>
              </Button>
            </HStack>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
