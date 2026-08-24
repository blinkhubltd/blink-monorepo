import React, { useCallback, useState, useEffect } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "@/components/ui/scroll-view";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openInMaps } from "@/lib/maps";
import { Id } from "@repo/backend/dataModel";
import { Linking, Alert } from "react-native";
import { formatKES } from "@/lib/currency";
import { ConfirmPickupModal } from "../components/modals/ConfirmPickupModal";
import { DirectionsModal } from "../components/modals/DirectionsModal";
import { DeliveryCodeModal } from "@/components/modals/DeliveryCodeModal";
import { CollectPaymentModal } from "@/components/modals/CollectPaymentModal";
import { useAuth } from "@/lib/auth";
import { useQuery as useConvexQuery } from "convex/react"; // alias if needed for clarity
import { THEME } from "@/theme/design";

export default function DeliveryDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [showDirectionsModal, setShowDirectionsModal] = React.useState(false);
  const [showDeliveryCodeModal, setShowDeliveryCodeModal] =
    React.useState(false);
  const [showCollectPaymentModal, setShowCollectPaymentModal] =
    React.useState(false);

  const details = useQuery(
    api.data.shipments.getShipmentDetails,
    id ? { shipmentId: id as Id<"shipments"> } : "skip",
  );

  const items = useQuery(
    api.data.order_items.listByOrder,
    details?.order?._id
      ? { orderId: details.order._id as Id<"orders"> }
      : "skip",
  );

  // Fetch convex user (rider) to pass riderId for verification auditing
  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    user?.id ? { clerkId: user.id } : "skip",
  );

  const updateStatus = useMutation(api.data.shipments.updateStatus);

  const handleStatusUpdate = useCallback(
    async (newStatus: string) => {
      if (!id) return;

      try {
        await updateStatus({
          shipmentId: id as Id<"shipments">,
          status: newStatus as any,
        });

        Alert.alert("Success", `Status updated to ${newStatus}`, [
          { text: "OK" },
        ]);

        // Navigate back after successful delivery
        if (newStatus === "Delivered") {
          setTimeout(() => router.back(), 1500);
        }
      } catch (error) {
        Alert.alert("Error", "Failed to update status");
      }
    },
    [id, updateStatus, router],
  );

  const makePhoneCall = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  // Auto open directions when shipment becomes Out for Delivery
  useEffect(() => {
    const canMarkDelivered = details?.status === "Out for Delivery";
    if (
      canMarkDelivered &&
      details?.delivery_address?.lat &&
      details?.delivery_address?.lng
    ) {
      setShowDirectionsModal(true);
    }
  }, [
    details?.status,
    details?.delivery_address?.lat,
    details?.delivery_address?.lng,
  ]);

  if (!id) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Invalid delivery ID</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (details === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: THEME.colors.warning + "15",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="bicycle-outline" size={28} color={THEME.colors.warning} />
          </View>
          <Spinner size="small" />
          <Text style={[styles.errorText, { marginTop: 12, fontSize: 14 }]}>
            Loading delivery details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (details === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Delivery not found</Text>
          <Button
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 16 }}
          >
            <ButtonText>Go Back</ButtonText>
          </Button>
        </View>
      </SafeAreaView>
    );
  }
  // Streamlined workflow: statuses auto-advance server-side to "Out for Delivery".
  const canPickUp = false;
  const canStartDelivery = false;
  const canMarkDelivered = details.status === "Out for Delivery";

  // Pay on delivery unpaid state for payment collection
  const isPayOnDeliveryUnpaid =
    details.order?.payment_mode === "pay_on_delivery" &&
    details.order?.payment_status === "Unpaid";

  // Determine if delivery code verification is required (pay_now orders only)
  const requiresDeliveryCode =
    canMarkDelivered &&
    details.order?.payment_mode === "pay_now" &&
    details.order?.payment_status === "Paid" &&
    !!details.order?.delivery_code &&
    !details.order?.delivery_code_verified;

  // Allow rider to collect payment when unpaid (pay_on_delivery) or pay_now awaiting payment at delivery phase
  const canCollectPayment =
    details.order?.payment_status === "Unpaid" &&
    (details.order?.payment_mode === "pay_on_delivery" ||
      (details.order?.payment_mode === "pay_now" && canMarkDelivered));

  const pickupAddress = `${details.pickup_address?.address_1 || ""}${
    details.pickup_address?.city ? ", " + details.pickup_address.city : ""
  }`.trim();

  const dropoffAddress = `${details.delivery_address?.address_1 || ""}${
    details.delivery_address?.city ? ", " + details.delivery_address.city : ""
  }`.trim();

  const statusColors: Record<
    | "Awaiting Pickup"
    | "Picked Up"
    | "Out for Delivery"
    | "Delivered"
    | "Failed Delivery"
    | "Cancelled",
    string
  > = {
    "Awaiting Pickup": THEME.colors.warning,
    "Picked Up": THEME.colors.info,
    "Out for Delivery": THEME.colors.primary,
    Delivered: THEME.colors.success,
    "Failed Delivery": THEME.colors.error,
    Cancelled: THEME.colors.textTertiary,
  };

  const statusColor =
    statusColors[
      details.status as
        | "Awaiting Pickup"
        | "Picked Up"
        | "Out for Delivery"
        | "Delivered"
        | "Failed Delivery"
        | "Cancelled"
    ] || THEME.colors.textTertiary;

  // Use indigo accent for clearance orders
  const headerBorderColor = details.order?.is_clearance
    ? THEME.colors.clearance
    : THEME.colors.border;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Track Order",
          headerStyle: { backgroundColor: THEME.colors.surface },
          headerTintColor: THEME.colors.text,
          headerTitleStyle: { fontSize: 18, fontWeight: "600" },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/deliveries")}
              style={{ padding: 8 }}
            >
              <Ionicons name="arrow-back-outline" size={24} color={THEME.colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView
        style={styles.container}
        edges={["bottom", "left", "right"]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Clearance Order Banner */}
          {details.order?.is_clearance && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                backgroundColor: THEME.colors.clearance,
                borderRadius: THEME.radius.md,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="pricetag-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: "700",
                    letterSpacing: 0.3,
                  }}
                >
                  Clearance Order
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  This delivery contains discounted clearance items
                </Text>
              </View>
            </View>
          )}

          {/* Header Card with Order Info */}

          <VStack
            space="lg"
            style={{
              flexDirection: "column",
              gap: 16,
              marginTop: 20,
            }}
          >
            {/* Order Details Card */}
            <Card
              style={{
                backgroundColor: THEME.colors.surface,
                marginHorizontal: 16,
                paddingHorizontal: 20,
                paddingVertical: 20,
                borderRadius: THEME.radius.md,
                borderWidth: details.order?.is_clearance ? 2 : 1,
                borderColor: headerBorderColor,
                ...THEME.shadow.card,
              }}
            >
              <VStack space="lg">
                {/* Delivery Progress */}
                <VStack space="md">
                  <HStack
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      Delivery Status
                    </Text>
                    <View
                      style={{
                        backgroundColor: statusColor,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "600",
                          fontSize: 12,
                        }}
                      >
                        {details.status}
                      </Text>
                    </View>
                  </HStack>
                  <HStack style={styles.rowStart} space="xs">
                    <Ionicons name="time-outline" size={16} color={THEME.colors.textSecondary} />
                    <Text style={{ color: THEME.colors.textSecondary, fontSize: 14 }}>
                      Updated{" "}
                      {new Date(details.updated_at).toLocaleTimeString()}
                    </Text>
                  </HStack>
                </VStack>

                {/* Order Summary */}
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: THEME.colors.border,
                    paddingTop: 16,
                  }}
                >
                  <VStack space="sm">
                    <HStack style={styles.rowBetween}>
                      <Text style={{ color: THEME.colors.textSecondary, fontSize: 14 }}>
                        Payment Method
                      </Text>
                      <Text
                        style={{
                          color: THEME.colors.text,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {details.order?.payment_method || "Cash"}
                      </Text>
                    </HStack>
                  </VStack>
                </View>
              </VStack>
            </Card>

            {/* Pickup & Delivery Locations */}
            <Card
              style={{
                backgroundColor: THEME.colors.surface,
                marginHorizontal: 16,
                borderRadius: THEME.radius.md,
                borderWidth: 1,
                borderColor: THEME.colors.border,
                ...THEME.shadow.card,
              }}
            >
              <VStack space="md" style={{ padding: 20 }}>
                {/* Pickup Location */}
                <VStack space="sm">
                  <HStack style={styles.rowStart} space="sm">
                    <View
                      style={{
                        backgroundColor: `${THEME.colors.warning}20`,

                        height: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                      }}
                    >
                      <HStack
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 8,
                          gap: 8,
                        }}
                        space="xs"
                      >
                        <Ionicons name="cube-outline" size={18} color={THEME.colors.warning} />
                        <Text
                          style={{
                            color: THEME.colors.warning,
                            fontSize: 16,
                            fontWeight: "600",
                          }}
                        >
                          Pickup
                        </Text>
                      </HStack>
                    </View>
                  </HStack>

                  <VStack
                    space="xs"
                    style={{ marginLeft: 48, marginVertical: 8 }}
                  >
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontWeight: "600",
                        fontSize: 15,
                      }}
                    >
                      {details.vendor?.name || "Vendor"}
                    </Text>
                    <Text
                      style={{
                        color: THEME.colors.textSecondary,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {pickupAddress || "Address not available"}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        openInMaps({
                          addressLabel: details.vendor?.name || "Pickup",
                          addressText: pickupAddress,
                        })
                      }
                      style={{ marginTop: 6 }}
                    >
                      <Text
                        style={{
                          color: THEME.colors.primary,
                          fontSize: 14,
                          fontWeight: "500",
                        }}
                      >
                        Get Directions
                      </Text>
                    </TouchableOpacity>
                  </VStack>
                </VStack>

                {/* Divider */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: THEME.colors.border,
                    marginVertical: 8,
                  }}
                />

                {/* Delivery Location */}
                <VStack space="sm">
                  <HStack style={styles.rowStart} space="sm">
                    <View
                      style={{
                        backgroundColor: `${THEME.colors.primary}20`,
                        height: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                      }}
                    >
                      <HStack
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 8,
                          gap: 8,
                        }}
                        space="xs"
                      >
                        <Ionicons name="location-outline" size={18} color={THEME.colors.primary} />
                        <Text
                          style={{
                            color: THEME.colors.primary,
                            fontSize: 16,
                            fontWeight: "600",
                          }}
                        >
                          Delivery
                        </Text>
                      </HStack>
                    </View>
                  </HStack>

                  <VStack
                    space="xs"
                    style={{ marginLeft: 48, marginVertical: 8 }}
                  >
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontWeight: "600",
                        fontSize: 15,
                      }}
                    >
                      {details.order?.receiver_contact
                        ? details.order?.receiver_contact.name
                        : details.customer?.name}
                    </Text>
                    <Text
                      style={{
                        color: THEME.colors.textSecondary,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {dropoffAddress || "Address not available"}
                    </Text>
                    <VStack space="sm" style={{ marginTop: 6 }}>
                      {/* Primary Contact (Receiver or Customer) */}
                      {(details.order?.receiver_contact?.phone ||
                        details.customer?.phone) && (
                        <TouchableOpacity
                          onPress={() =>
                            makePhoneCall(
                              details.order?.receiver_contact?.phone ||
                                details.customer?.phone,
                            )
                          }
                        >
                          <HStack space="xs" style={styles.rowStart}>
                            <Ionicons name="call-outline" size={14} color={THEME.colors.primary} />
                            <Text
                              style={{
                                color: THEME.colors.primary,
                                fontSize: 14,
                                fontWeight: "500",
                              }}
                            >
                              Call{" "}
                              {details.order?.receiver_contact?.name ||
                                (details.customer
                                  ? `${details.customer.first_name} `
                                  : "Customer")}
                            </Text>
                          </HStack>
                        </TouchableOpacity>
                      )}

                      {/* Fallback Customer Contact (shown when receiver contact exists) */}
                      {details.order?.receiver_contact &&
                        details.customer?.phone &&
                        details.order.receiver_contact.phone !==
                          details.customer.phone && (
                          <View style={{ marginTop: 8 }}>
                            <HStack
                              space="xs"
                              style={[styles.rowStart, { marginBottom: 4 }]}
                            >
                              <Text
                                style={{
                                  color: THEME.colors.textSecondary,
                                  fontSize: 13,
                                  fontWeight: "400",
                                }}
                              >
                                {details.order.receiver_contact.name} isn't
                                reachable?
                              </Text>
                            </HStack>
                            <TouchableOpacity
                              onPress={() =>
                                makePhoneCall(details.customer?.phone)
                              }
                              style={{
                                alignSelf: "flex-start",
                              }}
                            >
                              <Text
                                style={{
                                  color: THEME.colors.primary,
                                  fontSize: 13,
                                  fontWeight: "500",
                                  textDecorationLine: "underline",
                                }}
                              >
                                Call the customer ({details.customer.first_name}
                                )
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                    </VStack>
                  </VStack>
                </VStack>
              </VStack>
            </Card>

            {/* Order Items */}
            {items && items.length > 0 && (
              <Card
                style={{
                  backgroundColor: THEME.colors.surface,
                  marginHorizontal: 16,
                  borderRadius: THEME.radius.md,
                  borderWidth: 1,
                  borderColor: THEME.colors.border,
                  ...THEME.shadow.card,
                }}
              >
                <VStack space="md" style={{ padding: 20 }}>
                  <Text
                    style={{
                      color: THEME.colors.text,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    Order Items ({items.length})
                  </Text>
                  <VStack space="xs">
                    {items.map((item: any, index: number) => (
                      <HStack
                        key={String(item._id)}
                        style={[
                          styles.rowBetweenStart,
                          {
                            paddingVertical: 12,
                            borderBottomWidth: index < items.length - 1 ? 1 : 0,
                            borderBottomColor: THEME.colors.border,
                          },
                        ]}
                      >
                        <VStack style={styles.flex1} space="xs">
                          <Text
                            style={{
                              color: THEME.colors.text,
                              fontSize: 15,
                              fontWeight: "500",
                            }}
                          >
                            {item.name}
                          </Text>
                          <Text style={{ color: THEME.colors.textSecondary, fontSize: 13 }}>
                            Qty: {item.quantity}
                            {item.unit_value && item.unit_type && (
                              <Text>
                                {" "}
                                • {item.unit_value}
                                {item.unit_type}
                              </Text>
                            )}
                            <Text> × {formatKES(item.price || 0)}</Text>
                          </Text>
                        </VStack>
                        <Text
                          style={{
                            color: THEME.colors.text,
                            fontWeight: "600",
                            fontSize: 15,
                          }}
                        >
                          {formatKES(item.total || 0)}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </VStack>
              </Card>
            )}

            {/* Special Instructions */}
            {details.order?.special_instructions && (
              <Card
                style={{
                  backgroundColor: "#FEF9E7",
                  marginHorizontal: 16,
                  borderRadius: THEME.radius.md,
                  borderWidth: 1,
                  borderColor: "#FCD34D",
                  ...THEME.shadow.card,
                }}
              >
                <VStack space="sm" style={{ padding: 16 }}>
                  <HStack style={styles.rowStart} space="sm">
                    <View
                      style={{
                        backgroundColor: "#FCD34D40",
                        width: 24,
                        height: 24,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "#92400E",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        !
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: "#92400E",
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      Special Instructions
                    </Text>
                  </HStack>
                  <Text
                    style={{
                      color: "#78350F",
                      fontSize: 14,
                      lineHeight: 20,
                      marginLeft: 32,
                    }}
                  >
                    {details.order.special_instructions}
                  </Text>
                </VStack>
              </Card>
            )}
          </VStack>
        </ScrollView>

        {/* Bottom Action Bar (payment collection or delivery actions) */}
        {(canMarkDelivered || canCollectPayment) && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: THEME.colors.surface,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 16,
              borderTopWidth: 1,
              borderTopColor: THEME.colors.border + "30",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {details.delivery_address?.lat && details.delivery_address?.lng ? (
              <HStack
                style={{
                  flexDirection: "row",
                  gap: 10,
                  justifyContent: "space-between",
                }}
                space="sm"
              >
                <TouchableOpacity
                  onPress={() => setShowDirectionsModal(true)}
                  style={{
                    flex: 1,
                    backgroundColor: THEME.colors.primary,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: THEME.colors.primary,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                >
                  <HStack style={styles.rowCenter} space="xs">
                    <Ionicons name="navigate-outline" size={16} color="white" />
                    <Text
                      style={{
                        color: "white",
                        fontSize: 15,
                        fontWeight: "700",
                        letterSpacing: 0.2,
                      }}
                    >
                      Directions
                    </Text>
                  </HStack>
                </TouchableOpacity>

                {canCollectPayment ? (
                  <TouchableOpacity
                    onPress={() => setShowCollectPaymentModal(true)}
                    style={{
                      flex: 1,
                      backgroundColor: THEME.colors.success,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: THEME.colors.info,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 3,
                      borderWidth: 1.5,
                      borderColor: THEME.colors.info + "60",
                    }}
                  >
                    <HStack style={styles.rowCenter} space="xs">
                      <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                      <Text
                        style={{
                          color: "white",
                          fontSize: 15,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        Charge
                      </Text>
                    </HStack>
                  </TouchableOpacity>
                ) : requiresDeliveryCode ? (
                  <TouchableOpacity
                    onPress={() => setShowDeliveryCodeModal(true)}
                    style={{
                      flex: 1,
                      backgroundColor: THEME.colors.success,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: THEME.colors.success,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 3,
                      borderWidth: 1.5,
                      borderColor: THEME.colors.success + "60",
                    }}
                  >
                    <HStack style={styles.rowCenter} space="xs">
                      <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                      <Text
                        style={{
                          color: "white",
                          fontSize: 15,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        Enter Code
                      </Text>
                    </HStack>
                  </TouchableOpacity>
                ) : canMarkDelivered ? (
                  <TouchableOpacity
                    onPress={() => handleStatusUpdate("Delivered")}
                    style={{
                      flex: 1,
                      backgroundColor: THEME.colors.success,
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: THEME.colors.success,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 3,
                    }}
                  >
                    <HStack style={styles.rowCenter} space="xs">
                      <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                      <Text
                        style={{
                          color: "white",
                          fontSize: 15,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        Delivered
                      </Text>
                    </HStack>
                  </TouchableOpacity>
                ) : null}
              </HStack>
            ) : (
              /* No precise coordinates: single prominent button */
              <TouchableOpacity
                onPress={() =>
                  canCollectPayment
                    ? setShowCollectPaymentModal(true)
                    : requiresDeliveryCode
                      ? setShowDeliveryCodeModal(true)
                      : handleStatusUpdate("Delivered")
                }
                style={{
                  backgroundColor: requiresDeliveryCode
                    ? THEME.colors.success
                    : canCollectPayment
                      ? THEME.colors.info
                      : THEME.colors.success,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: THEME.colors.success,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                  borderWidth: requiresDeliveryCode ? 1.5 : 0,
                  borderColor: requiresDeliveryCode
                    ? THEME.colors.success + "60"
                    : "transparent",
                }}
              >
                <HStack style={styles.rowCenter} space="sm">
                  <Ionicons name="checkmark-circle-outline" size={18} color="white" />
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontWeight: "700",
                      letterSpacing: 0.3,
                    }}
                  >
                    {canCollectPayment
                      ? "Collect Payment"
                      : requiresDeliveryCode
                        ? "Enter Delivery Code"
                        : "Mark as Delivered"}
                  </Text>
                </HStack>
              </TouchableOpacity>
            )}

            {(requiresDeliveryCode || isPayOnDeliveryUnpaid) && (
              <View
                style={{
                  marginTop: 6,
                  alignItems: "center",
                  backgroundColor: THEME.colors.info + "08",
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  alignSelf: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: THEME.colors.info,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {requiresDeliveryCode
                    ? "🔐 Delivery verification required"
                    : "💳 Payment required before handover"}
                </Text>
              </View>
            )}
          </View>
        )}

        <ConfirmPickupModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          items={items}
          onConfirm={() => {
            setShowConfirmModal(false);
            handleStatusUpdate("Picked Up");
          }}
        />

        {canMarkDelivered &&
          details.delivery_address &&
          details.delivery_address.lat &&
          details.delivery_address.lng && (
            <DirectionsModal
              isOpen={showDirectionsModal}
              onClose={() => setShowDirectionsModal(false)}
              customerLocation={{
                latitude: details.delivery_address.lat,
                longitude: details.delivery_address.lng,
                address: dropoffAddress,
                customerName:
                  details.order?.receiver_contact?.name ||
                  (details.customer
                    ? `${details.customer.first_name} ${details.customer.last_name}`
                    : "Customer"),
              }}
              onMarkDelivered={() => handleStatusUpdate("Delivered")}
            />
          )}

        {/* Delivery Code Modal */}
        {requiresDeliveryCode && details.order && (
          <DeliveryCodeModal
            isOpen={showDeliveryCodeModal}
            onClose={() => setShowDeliveryCodeModal(false)}
            orderId={details.order._id as Id<"orders">}
            riderId={convexUser?._id}
            existingCode={details.order.delivery_code}
            onVerified={() => {
              // After successful verification, ensure shipment status reflects Delivered
              handleStatusUpdate("Delivered");
            }}
          />
        )}
        {showCollectPaymentModal && details.order && (
          <CollectPaymentModal
            isOpen={showCollectPaymentModal}
            onClose={() => setShowCollectPaymentModal(false)}
            orderId={details.order._id as Id<"orders">}
            customerEmail={details.customer?.email || null}
            customerPhone={details.customer?.phone || null}
            receiverPhone={details.order.receiver_contact?.phone || null}
            amount={details.order.total_amount || 0}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: THEME.colors.textSecondary,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
    paddingTop: 16,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowBetweenStart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rowStart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  flex1: {
    flex: 1,
  },
});
