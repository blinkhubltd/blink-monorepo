import React, { useState } from "react";
import {
  Alert,
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlError,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Input, InputField } from "@/components/ui/input";
import { Button, ButtonText } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

interface PhoneUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhone?: string;
  onSave: (phone: string) => Promise<void>;
}

export function PhoneUpdateModal({
  isOpen,
  onClose,
  currentPhone = "",
  onSave,
}: PhoneUpdateModalProps) {
  const [phone, setPhone] = useState(currentPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validatePhone = (phoneNumber: string) => {
    // Basic phone validation - adjust regex based on your requirements
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
    return phoneRegex.test(phoneNumber.trim());
  };

  const handleSave = async () => {
    const trimmedPhone = phone.trim();

    if (!trimmedPhone) {
      setError("Phone number is required");
      return;
    }

    if (!validatePhone(trimmedPhone)) {
      setError("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSave(trimmedPhone);
      Alert.alert("Success", "Phone number updated successfully!");
      onClose();
    } catch (err) {
      setError("Failed to update phone number. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone(currentPhone);
    setError("");
    onClose();
  };

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
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
        onPress={handleClose}
      >
        {/* Modal Content */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: THEME.colors.surface,
            borderRadius: 20,
            maxWidth: 400,
            width: screenWidth - 40,
            maxHeight: screenHeight * 0.8,
            borderWidth: 1,
            borderColor: THEME.colors.border,
            ...THEME.shadow.card,
          }}
        >
          {/* Modal Header */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 0,
              borderBottomWidth: 1,
              borderBottomColor: THEME.colors.border + "20",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Heading size="lg" style={{ color: THEME.colors.text, flex: 1 }}>
              Update Phone Number
            </Heading>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: THEME.colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Modal Body */}
          <ScrollView
            style={{ maxHeight: screenHeight * 0.5 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingVertical: 10, paddingHorizontal: 20 }}>
              <VStack space="lg">
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  Please enter your phone number. This will be used for
                  important account notifications.
                </Text>

                <FormControl isInvalid={!!error}>
                  <FormControlLabel>
                    <FormControlLabelText
                      style={{ color: THEME.colors.text, marginBottom: 8 }}
                    >
                      Phone Number
                    </FormControlLabelText>
                  </FormControlLabel>
                  <Input
                    style={{
                      borderColor: error
                        ? THEME.colors.error
                        : THEME.colors.border,
                      borderWidth: 1.5,
                      borderRadius: 12,
                      backgroundColor: THEME.colors.background,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      minHeight: 36,
                    }}
                  >
                    <InputField
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+1 (555) 123-4567"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      style={{
                        color: THEME.colors.text,
                        fontSize: 14,
                        fontWeight: "400",
                      }}
                      placeholderTextColor={THEME.colors.textSecondary}
                    />
                  </Input>
                  {error && (
                    <FormControlError>
                      <FormControlErrorText>{error}</FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              </VStack>
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View
            style={{
              padding: 20,
              borderTopWidth: 1,
              borderTopColor: THEME.colors.border + "20",
            }}
          >
            <HStack
              space="sm"
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 12,
                width: "100%",
              }}
            >
              <Button
                variant="outline"
                onPress={handleClose}
                disabled={loading}
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  borderColor: THEME.colors.border,
                  borderWidth: 1.5,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: "transparent",
                }}
              >
                <ButtonText
                  style={{
                    color: THEME.colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Cancel
                </ButtonText>
              </Button>
              <Button
                onPress={handleSave}
                disabled={loading}
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  backgroundColor: THEME.colors.primary,
                  opacity: loading ? 0.6 : 1,
                  height: 48,
                  borderRadius: 12,
                  ...THEME.shadow.card,
                  shadowOpacity: 0.1,
                }}
              >
                <ButtonText
                  style={{
                    color: "white",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {loading ? "Updating..." : "Save Phone Number"}
                </ButtonText>
              </Button>
            </HStack>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
