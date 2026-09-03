import { Linking, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Bike, Check, Phone } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../../components/screen-header";
import { NotFoundState } from "../../../components/states";
import {
  ORDER_JOURNEY,
  presentStatus,
  type OrderStatus,
} from "../../../lib/order-status";

/**
 * Live tracking for one order.
 *
 * ── What it deliberately does not show ───────────────────────────────────
 *
 * The backend queries this replaces returned whole rows: the rider's full
 * record and the customer's, to any anonymous caller holding a shipment id.
 * `getMyOrderTracking` is owner-scoped and narrow — first name, a phone number
 * only while the parcel is actually moving, and a position on the same
 * condition.
 *
 * That last part is a judgement rather than a limitation. Before a rider has
 * collected the order their location says nothing about the delivery; it is just
 * where a person happens to be. Showing it would be surveillance dressed as a
 * feature.
 *
 * ── The status track ─────────────────────────────────────────────────────
 *
 * Rendered from a typed map (`lib/order-status.ts`), so a status the map does
 * not know falls back to its raw name rather than an invisibly unstyled badge —
 * which is what interpolated class names gave the old app, and why its Tailwind
 * config needed a safelist regex.
 */
export default function TrackOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const tracking = useQuery(
    api.data.tracking.getMyOrderTracking,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip",
  );

  if (tracking === undefined) return <TrackSkeleton />;
  if (tracking === null) {
    return (
      <NotFoundState what="order" onBack={() => router.replace("/orders")} />
    );
  }

  const status = presentStatus(tracking.orderStatus);
  const currentStep = status.step;

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader eyebrow="Tracking" title={status.label} showCart={false} />

      <ScrollView contentContainerClassName="px-screen gap-space-6 pb-space-10">
        <Text size="sm" variant="muted">
          {status.helper}
        </Text>

        {/*
          Off-track statuses get no progress rail: drawing five steps with none
          of them reachable is worse than not drawing it.
        */}
        {currentStep === null ? (
          <View className="bg-muted p-space-5 rounded-lg">
            <Badge variant={status.variant} label={status.label} />
          </View>
        ) : (
          <View className="gap-space-4">
            {ORDER_JOURNEY.map((step, index) => {
              const stepNumber = index + 1;
              const done = currentStep >= stepNumber;
              const active = currentStep === stepNumber;
              const stepStatus = presentStatus(step as OrderStatus);

              return (
                <View key={step} className="gap-space-3 flex-row items-start">
                  <View className="items-center">
                    <View
                      className={`rounded-pill size-[24px] items-center justify-center ${
                        done ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      {done ? (
                        <Check size={14} color="#0A0E16" />
                      ) : (
                        <Text size="caption" variant="subtle">
                          {stepNumber}
                        </Text>
                      )}
                    </View>
                    {/* The connector, omitted after the last step. */}
                    {index < ORDER_JOURNEY.length - 1 ? (
                      <View
                        className={`mt-[2px] h-[28px] w-[2px] ${
                          currentStep > stepNumber ? "bg-primary" : "bg-border"
                        }`}
                      />
                    ) : null}
                  </View>
                  <View className="gap-space-1 pb-space-1 flex-1">
                    <Text
                      size="sm"
                      weight={active ? "semibold" : "regular"}
                      variant={done ? "default" : "subtle"}
                    >
                      {stepStatus.label}
                    </Text>
                    {active ? (
                      <Text size="caption" variant="muted">
                        {stepStatus.helper}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Only once there is a rider carrying it. */}
        {tracking.riderFirstName ? (
          <View className="border-hairline border-border gap-space-3 p-space-4 rounded-lg">
            <View className="gap-space-3 flex-row items-center">
              <View className="bg-accent size-control rounded-pill items-center justify-center">
                <Bike size={20} color="#0A0E16" />
              </View>
              <View className="gap-space-1 flex-1">
                <Text size="sm" weight="semibold">
                  {tracking.riderFirstName}
                </Text>
                <Text size="caption" variant="subtle">
                  {tracking.vehicleType ?? "Rider"}
                  {tracking.shipmentStatus
                    ? ` · ${tracking.shipmentStatus}`
                    : ""}
                </Text>
              </View>
            </View>

            {/*
              The number appears only while the parcel is moving. Before that
              there is nothing to call about, and it is the rider's personal
              number.
            */}
            {tracking.riderPhone ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(`tel:${tracking.riderPhone}`)
                }
                accessibilityRole="button"
                accessibilityLabel={`Call ${tracking.riderFirstName}`}
                className="bg-inverse gap-space-2 p-space-3 flex-row items-center justify-center rounded-md active:opacity-80"
              >
                <Phone size={16} color="#FFFFFF" />
                <Text variant="onInverse" size="sm" weight="semibold">
                  Call {tracking.riderFirstName}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {tracking.deliveryCodeRequired ? (
          <View className="bg-warning-soft gap-space-1 p-space-4 rounded-lg">
            <Text size="sm" weight="semibold">
              You will need your delivery code
            </Text>
            <Text size="sm">
              The rider will ask for the six-digit code we sent you. Do not
              share it before your order is in your hands.
            </Text>
          </View>
        ) : null}

        <Button
          variant="outline"
          label="Order details"
          onPress={() => router.replace(`/order/${orderId}`)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function TrackSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[28px] w-1/2 rounded-sm" />
      </View>
      <View className="px-screen gap-space-4">
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} className="gap-space-3 flex-row items-center">
            <Skeleton className="rounded-pill size-[24px]" />
            <Skeleton className="h-[15px] w-1/2 rounded-sm" />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
