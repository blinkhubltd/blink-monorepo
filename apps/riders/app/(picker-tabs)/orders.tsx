import React, { useState, useCallback } from "react";
import { View, RefreshControl, TouchableOpacity, Alert } from "react-native";
import TabSelector from "@/components/ui/TabSelector";
import { STATUS_COLORS as COLORS } from "@/theme/colors";
import StatsHeader from "@/components/ui/StatsHeader";
import { useRouter } from "expo-router";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import Ionicons from "@expo/vector-icons/Ionicons";
import PickerOrderCardNew from "@/components/cards/PickerOrderCardNew";
import { useUserData, usePickerOrders } from "@/providers/DataProvider";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useTheme } from "@/theme/ThemeContext";
import { SkeletonBox } from "@/components/ui/SkeletonBox";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_COLORS = COLORS;

type ViewMode = "all" | "pending";

function OrderListSkeleton() {
  const theme = useTheme();
  return (
    <VStack style={{ gap: 12, paddingTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...theme.shadow.card,
            gap: 10,
          }}
        >
          <SkeletonBox width="55%" height={14} borderRadius={6} />
          <SkeletonBox width="35%" height={11} borderRadius={5} />
          <SkeletonBox width="80%" height={11} borderRadius={5} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <SkeletonBox width="48%" height={36} borderRadius={8} />
            <SkeletonBox width="48%" height={36} borderRadius={8} />
          </View>
        </View>
      ))}
    </VStack>
  );
}

export default function PickerOrdersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("pending");

  const { currentUser, isUserLoading } = useUserData();
  const { pickerOrders: allOrders, pickerCompletedOrders: completedOrders, isPickerOrdersLoading } =
    usePickerOrders();

  const awaitingPrescriptions = useQuery(
    api.data.prescriptions.getOrdersAwaitingPrescription,
    currentUser?.picker_details?.vendor_id && currentUser?._id
      ? { vendorId: currentUser.picker_details.vendor_id, pickerId: currentUser._id }
      : "skip",
  );

  const finalizePicking = useMutation(api.data.orders.finalizePicking);
  const markReadyForPickup = useMutation(api.data.picker_orders.markReadyForPickup);

  const handleFinalizePicking = useCallback(
    async (orderId: string) => {
      try {
        const result = await finalizePicking({ orderId: orderId as any });
        Alert.alert(
          result?.advanced ? "Order Advanced" : "Not Advanced",
          result?.advanced
            ? "Order moved to Delivery. Rider will now see directions."
            : result?.reason === "ALREADY_PAST_PICKING"
            ? "Order already past picking stage."
            : "Could not advance order.",
          [{ text: "OK" }],
        );
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to finalize picking.");
      }
    },
    [finalizePicking],
  );

  const handleMarkReadyForPickup = useCallback(
    async (orderId: string) => {
      try {
        await markReadyForPickup({
          orderId: orderId as Id<"orders">,
          pickerId: currentUser?._id as Id<"users">,
        });
        Alert.alert("Success", "Order marked as ready for pickup!", [{ text: "OK" }]);
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to mark order as ready.");
      }
    },
    [markReadyForPickup, currentUser?._id],
  );

  const pendingOrders =
    allOrders?.filter(
      (o) =>
        o.order_status === "Pending" ||
        o.order_status === "Confirmed" ||
        o.order_status === "Processing",
    ) || [];

  const orders =
    viewMode === "pending" ? pendingOrders : [...(allOrders || []), ...(completedOrders || [])];
  const totalAllOrders = (allOrders?.length || 0) + (completedOrders?.length || 0);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderOrderCard = useCallback(
    (order: any) => (
      <PickerOrderCardNew
        key={order._id}
        order={order}
        onPress={() => router.push(`/picker-order-details?id=${order._id}`)}
      />
    ),
    [router],
  );

  if (isUserLoading || isPickerOrdersLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: theme.TAB_BOTTOM_PADDING }}
        >
          <OrderListSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <VStack style={{ flex: 1 }}>
        {/* Header */}
        <VStack style={{ backgroundColor: theme.colors.surface, paddingBottom: 8 }}>
          <HStack
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: theme.colors.text,
                flex: 1,
                letterSpacing: -0.5,
              }}
            >
              Orders
            </Text>
            <View
              style={{
                backgroundColor: theme.colors.primary,
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#000" }}>
                {viewMode === "pending"
                  ? `${pendingOrders.length} Pending`
                  : `${totalAllOrders} Total`}
              </Text>
            </View>
          </HStack>

          {/* Prescription alert */}
          {awaitingPrescriptions && awaitingPrescriptions.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push("/prescription-verification")}
              activeOpacity={0.8}
              style={{
                marginHorizontal: 20,
                marginBottom: 12,
                backgroundColor: theme.colors.prescriptionBg,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: theme.colors.prescription,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
                <View
                  style={{
                    backgroundColor: theme.colors.prescription,
                    borderRadius: 10,
                    padding: 8,
                  }}
                >
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: theme.colors.prescriptionText,
                      marginBottom: 2,
                    }}
                  >
                    Prescriptions Awaiting
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: theme.colors.prescriptionText, fontWeight: "500", opacity: 0.8 }}
                  >
                    {awaitingPrescriptions.length} order(s) need review
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.prescription} />
            </TouchableOpacity>
          )}

          <TabSelector
            tabs={[
              { key: "pending", label: "Pending", icon: "time-outline", count: pendingOrders.length },
              { key: "all", label: "All Orders", icon: "list-outline", count: totalAllOrders },
            ]}
            activeKey={viewMode}
            onChange={(k) => setViewMode(k as ViewMode)}
            colors={STATUS_COLORS}
          />
        </VStack>

        {/* Orders list */}
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}
          contentContainerStyle={{ paddingBottom: theme.TAB_BOTTOM_PADDING }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {orders.length > 0 && allOrders && allOrders.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <StatsHeader
                items={[
                  {
                    value: allOrders.filter((d) => d.order_status === "Confirmed").length,
                    label: "To Pick",
                    color: theme.colors.success,
                  },
                  {
                    value: allOrders.filter((d) => d.order_status === "Processing").length,
                    label: "In Progress",
                    color: theme.colors.warning,
                  },
                  {
                    value: allOrders.filter((d) => d.order_status === "Pickup").length,
                    label: "Ready",
                    color: theme.colors.primary,
                  },
                ]}
                surfaceColor={theme.colors.surface}
                borderColor={theme.colors.border}
              />
            </View>
          )}

          {orders.length === 0 ? (
            <EmptyState
              icon={viewMode === "pending" ? "cube-outline" : "list-outline"}
              title={viewMode === "pending" ? "No Pending Orders" : "No Orders Found"}
              subtitle={
                viewMode === "pending"
                  ? "New orders will appear here when they're ready for picking."
                  : "Your order history will appear here."
              }
            />
          ) : (
            <VStack>{orders.map(renderOrderCard)}</VStack>
          )}
        </ScrollView>
      </VStack>
    </SafeAreaView>
  );
}
