import React, { useState, useEffect, useRef } from "react";
import { RefreshControl, Alert, View, Animated } from "react-native";
import TabSelector from "@/components/ui/TabSelector";
import { STATUS_COLORS as COLORS } from "@/theme/colors";
import StatsHeader from "@/components/ui/StatsHeader";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Card } from "@/components/ui/card";
import { Badge, BadgeText } from "@/components/ui/badge";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { Pressable } from "@/components/ui/pressable";
import DeliveryCard from "@/components/cards/DeliveryCard";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogCloseButton,
  AlertDialogBody,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useLocationService } from "@/lib/location/provider";
import { useDeliveries, useUserData } from "@/providers/DataProvider";
import { useTheme } from "@/theme/ThemeContext";
import { SkeletonBox } from "@/components/ui/SkeletonBox";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_COLORS = COLORS;

type ShipmentStatus =
  | "Awaiting Pickup"
  | "Picked Up"
  | "Out for Delivery"
  | "Delivered"
  | "Failed Delivery";

type ViewMode = "all" | "pending";

const statusColors = {
  "Awaiting Pickup": STATUS_COLORS.warning,
  "Picked Up": STATUS_COLORS.info,
  "Out for Delivery": STATUS_COLORS.primary,
  Delivered: STATUS_COLORS.success,
  "Failed Delivery": STATUS_COLORS.error,
};

// Ionicon names for each status
const statusIconNames: Record<ShipmentStatus, string> = {
  "Awaiting Pickup": "time-outline",
  "Picked Up": "cube-outline",
  "Out for Delivery": "car-outline",
  Delivered: "checkmark-circle-outline",
  "Failed Delivery": "time-outline",
};

function DeliveryListSkeleton() {
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
            gap: 12,
          }}
        >
          <SkeletonBox width="60%" height={14} borderRadius={6} />
          <SkeletonBox width="40%" height={11} borderRadius={5} />
          <View
            style={{ flexDirection: "row", gap: 8, marginTop: 4 }}
          >
            <SkeletonBox width="48%" height={36} borderRadius={8} />
            <SkeletonBox width="48%" height={36} borderRadius={8} />
          </View>
        </View>
      ))}
    </VStack>
  );
}

export default function DeliveriesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { startActiveDelivery, goOnlineIdle } = useLocationService();
  const [viewMode, setViewMode] = useState<ViewMode>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{
    shipmentId: Id<"shipments"> | null;
    newStatus: ShipmentStatus | null;
    currentStatus: ShipmentStatus | null;
  }>({ shipmentId: null, newStatus: null, currentStatus: null });

  const { currentUser, isUserLoading } = useUserData();
  const { allDeliveries, pendingDeliveries, isDeliveriesLoading } =
    useDeliveries();

  const completedDeliveries = (allDeliveries || []).filter(
    (d: any) => d.status === "Delivered",
  );
  const deliveries =
    viewMode === "pending" ? pendingDeliveries : completedDeliveries;

  const updateStatus = useMutation(api.data.shipments.updateStatus);

  useEffect(() => {
    goOnlineIdle().catch(() => {});
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const indicatorX = useRef(new Animated.Value(0)).current;
  const [selectorWidth, setSelectorWidth] = useState(0);
  const innerWidth = Math.max(0, selectorWidth - 8);

  useEffect(() => {
    const toValue = viewMode === "pending" ? 0 : innerWidth / 2;
    Animated.spring(indicatorX, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 120,
    }).start();
  }, [viewMode, innerWidth]);

  const handleStatusUpdate = async (
    shipmentId: Id<"shipments">,
    newStatus: ShipmentStatus,
    currentStatus: ShipmentStatus,
  ) => {
    if (currentStatus === "Awaiting Pickup" && newStatus === "Delivered") {
      Alert.alert(
        "Invalid Status Update",
        "You must first pick up the order before marking it as delivered.",
        [{ text: "OK" }],
      );
      return;
    }
    if (currentStatus === "Delivered") {
      Alert.alert("Already Delivered", "This order has already been delivered.", [
        { text: "OK" },
      ]);
      return;
    }
    setPendingStatusUpdate({ shipmentId, newStatus, currentStatus });
    setShowStatusDialog(true);
  };

  const confirmStatusUpdate = async () => {
    if (!pendingStatusUpdate.shipmentId || !pendingStatusUpdate.newStatus)
      return;
    try {
      await updateStatus({
        shipmentId: pendingStatusUpdate.shipmentId,
        status: pendingStatusUpdate.newStatus,
      });
      if (
        pendingStatusUpdate.newStatus === "Out for Delivery" ||
        pendingStatusUpdate.newStatus === "Picked Up"
      ) {
        await startActiveDelivery().catch(() => {});
      }
      Alert.alert(
        "Success",
        `Delivery status updated to ${pendingStatusUpdate.newStatus}`,
        [{ text: "OK" }],
      );
      setShowStatusDialog(false);
      setPendingStatusUpdate({ shipmentId: null, newStatus: null, currentStatus: null });
    } catch (error) {
      Alert.alert("Error", "Failed to update delivery status", [{ text: "OK" }]);
      console.error(error);
    }
  };

  const getNextStatus = (
    currentStatus: ShipmentStatus,
  ): ShipmentStatus | null => {
    switch (currentStatus) {
      case "Awaiting Pickup":
        return "Picked Up";
      case "Picked Up":
        return "Out for Delivery";
      case "Out for Delivery":
        return "Delivered";
      default:
        return null;
    }
  };

  const renderDeliveryCard = (delivery: any) => {
    const iconName = statusIconNames[delivery.status as ShipmentStatus];
    const nextStatus = getNextStatus(delivery.status as ShipmentStatus);
    const statusColor = statusColors[delivery.status as ShipmentStatus];
    const StatusIcon = () => (
      <Ionicons
        name={iconName as any}
        size={16}
        color={statusColor}
      />
    );
    return (
      <DeliveryCard
        key={delivery._id}
        delivery={delivery}
        statusColor={statusColor}
        StatusIcon={StatusIcon}
        nextStatus={nextStatus}
        onPrimaryPress={() =>
          nextStatus &&
          handleStatusUpdate(
            delivery._id,
            nextStatus as ShipmentStatus,
            delivery.status as ShipmentStatus,
          )
        }
        onDetailsPress={() =>
          router.push(`/delivery-details?id=${delivery._id}`)
        }
        STATUS_COLORS={STATUS_COLORS as any}
      />
    );
  };

  if (isUserLoading || isDeliveriesLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: theme.TAB_BOTTOM_PADDING }}
        >
          <DeliveryListSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <VStack style={{ flex: 1 }}>
        <VStack style={{ backgroundColor: theme.colors.surface }}>
          <TabSelector
            tabs={[
              {
                key: "pending",
                label: "Pending",
                icon: "time-outline",
                count: pendingDeliveries?.length || 0,
              },
              {
                key: "all",
                label: "Completed",
                icon: "list-outline",
                count: completedDeliveries.length || 0,
              },
            ]}
            activeKey={viewMode}
            onChange={(k) => setViewMode(k as ViewMode)}
            colors={STATUS_COLORS}
          />
        </VStack>

        <ScrollView
          style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 8 }}
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
          {deliveries && deliveries.length === 0 ? (
            <EmptyState
              icon={viewMode === "pending" ? "car-outline" : "checkmark-circle-outline"}
              title={
                viewMode === "pending"
                  ? "No pending deliveries"
                  : "No completed deliveries"
              }
              subtitle={
                viewMode === "pending"
                  ? "New deliveries will appear here when assigned to you."
                  : "Complete deliveries to view them here."
              }
            />
          ) : (
            <VStack>{(deliveries || []).map(renderDeliveryCard)}</VStack>
          )}
        </ScrollView>
      </VStack>

      <AlertDialog
        isOpen={showStatusDialog}
        onClose={() => setShowStatusDialog(false)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="lg">Update Delivery Status</Heading>
            <AlertDialogCloseButton>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </AlertDialogCloseButton>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>
              Are you sure you want to mark this delivery as "
              {pendingStatusUpdate.newStatus}"?
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack style={{ gap: 8 }}>
              <Button
                variant="outline"
                action="secondary"
                onPress={() => {
                  setShowStatusDialog(false);
                  setPendingStatusUpdate({
                    shipmentId: null,
                    newStatus: null,
                    currentStatus: null,
                  });
                }}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button
                style={{
                  backgroundColor: theme.colors.primary,
                  minHeight: 40,
                }}
                onPress={confirmStatusUpdate}
              >
                <ButtonText style={{ color: "#000000" }}>Confirm</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SafeAreaView>
  );
}
