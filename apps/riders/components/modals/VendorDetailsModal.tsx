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
import { formatAddress, formatServiceRadius } from "@/lib/formatters";
import { InfoItem } from "../infoItem";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface VendorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: {
    _id: string;
    _creationTime: number;
    name: string;
    hub_manager?: {
      _id: string;
      name: string;
      phone: string;
      email: string;
    } | null;
    contact: {
      name: string;
      phone: string;
      email: string;
    };
    address: {
      address_1?: string;
      address_2?: string;
      city?: string;
      country?: string;
    };
    coordinates: {
      lat: number;
      lng: number;
    };
    service_radius: number;
    status: "Active" | "Inactive";
    commission: number;
    commission_type: "percentage" | "fixed";
    updated_at?: number;
  } | null;
}

export function VendorDetailsModal({
  isOpen,
  onClose,
  vendor,
}: VendorDetailsModalProps) {
  if (!vendor) {
    return null;
  }

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
          {/* Modal Header */}
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
                  Vendor Details
                </Heading>
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 14,
                  }}
                >
                  Your assigned vendor information
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

          {/* Modal Body */}
          <ScrollView
            style={{ maxHeight: screenHeight * 0.6 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ padding: 20 }}>
              <VStack space="xl">
                {/* Vendor Name Header */}
                <View
                  style={{
                    backgroundColor: THEME.colors.primary + "10",
                    padding: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: THEME.colors.primary + "20",
                  }}
                >
                  <HStack
                    space="sm"
                    style={{
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: THEME.colors.primary + "20",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="business-outline" size={20} color={THEME.colors.primary} />
                    </View>
                    <VStack style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: THEME.colors.text,
                        }}
                      >
                        {vendor.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: THEME.colors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        {vendor.status} •{" "}
                        {vendor.commission_type === "percentage"
                          ? `${vendor.commission}%`
                          : `$${vendor.commission}`}{" "}
                        commission
                      </Text>
                    </VStack>
                  </HStack>
                </View>

                {/* Contact Information */}
                <VStack space="lg">
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: THEME.colors.text,
                      marginVertical: 12,
                    }}
                  >
                    Contact Information
                  </Text>

                  <VStack space="md">
                    <InfoItem
                      icon="location-outline"
                      label="Address"
                      value={formatAddress(vendor.address)}
                    />

                    {vendor.hub_manager ? (
                      <>
                        <InfoItem
                          icon="call-outline"
                          label="Hub Manager"
                          value={vendor.hub_manager.name}
                        />
                        <InfoItem
                          icon="call-outline"
                          label="Phone"
                          value={vendor.hub_manager.phone}
                        />
                        <InfoItem
                          icon="mail-outline"
                          label="Email"
                          value={vendor.hub_manager.email}
                        />
                      </>
                    ) : (
                      <View
                        style={{
                          backgroundColor: THEME.colors.surfaceSecondary + "30",
                          borderWidth: 1,
                          borderColor: THEME.colors.border + "40",
                          padding: 12,
                          borderRadius: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: THEME.colors.text,
                            marginBottom: 4,
                          }}
                        >
                          Hub manager not assigned
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          An admin can assign a hub manager to this vendor. Once
                          assigned, their name, phone and email will appear here
                          for riders and pickers.
                        </Text>
                      </View>
                    )}

                    <InfoItem
                      icon="radio-button-on-outline"
                      label="Service Radius"
                      value={formatServiceRadius(vendor.service_radius)}
                    />
                  </VStack>
                </VStack>
              </VStack>
            </View>
          </ScrollView>

          {/* Modal Footer */}
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
            <Button
              variant="outline"
              onPress={onClose}
              style={{
                borderColor: THEME.colors.border,
                backgroundColor: THEME.colors.primary + "15", // light tint of primary
                borderWidth: 1,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 20,
                width: "auto", // don't stretch full width
              }}
            >
              <ButtonText
                style={{
                  color: THEME.colors.primary,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Close
              </ButtonText>
            </Button>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
