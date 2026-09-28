import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import type { Id } from "@repo/backend/dataModel";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { OtpInput } from "@repo/mobile-ui/components/ui/otp-input";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { Screen } from "../../../components/Screen";
import { CustomerCard } from "../../../components/job/CustomerCard";
import { DetailHeader } from "../../../components/job/DetailHeader";
import { ItemsCard } from "../../../components/job/ItemsCard";
import { StepTrack } from "../../../components/job/StepTrack";
import { DeliveredView } from "../../../components/job/DeliveredView";
import {
  useConfirmDelivery,
  useDelivery,
  useStartRide,
  type DeliveryModel,
} from "../../../lib/data";
import { dropBy } from "../../../lib/earnings";
import { formatClock, formatMoney } from "../../../lib/format";
import { directionsUrl, distanceKm, formatDistance } from "../../../lib/geo";
import { canStartRide, isOnTheWay } from "../../../lib/job-status";
import { useDeviceLocation } from "../../../lib/use-device-location";

const CODE_LENGTH = 6;

/**
 * One delivery. A live one shows the job — track, map, customer, bag, and the
 * handover code; a delivered one shows the record of it (`DeliveredView`).
 *
 * One route for both because a rider reaches both the same way, from a card
 * on the Deliveries tab, and the id is the same shipment either way.
 */
export default function DeliveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shipmentId = (id ?? null) as Id<"shipments"> | null;
  const model = useDelivery(shipmentId);

  if (model === undefined) {
    return (
      <View className="flex-1 bg-background">
        <DetailHeader title="Delivery details" />
        <Screen>
          <View className="gap-[14px] pt-space-3">
            <Skeleton className="h-[26px] w-full" />
            <Skeleton className="h-[260px] rounded-lg" />
            <Card className="h-[140px]" />
            <Card className="h-[180px]" />
          </View>
        </Screen>
      </View>
    );
  }

  if (model === null || !shipmentId) {
    return (
      <View className="flex-1 bg-background">
        <DetailHeader title="Delivery details" />
        <Screen>
          <Card className="mt-space-3 items-center gap-space-3 py-space-8">
            <Text weight="semibold" className="text-strong">
              Delivery not available
            </Text>
            <Text variant="muted" size="sm" className="text-center">
              It may have been reassigned to another rider.
            </Text>
          </Card>
        </Screen>
      </View>
    );
  }

  if (model.detail.status === "Delivered") {
    return <DeliveredView detail={model.detail} />;
  }

  return <LiveDelivery model={model} shipmentId={shipmentId} />;
}

function LiveDelivery({
  model,
  shipmentId,
}: {
  model: DeliveryModel;
  shipmentId: Id<"shipments">;
}) {
  const router = useRouter();
  const here = useDeviceLocation();
  const confirmDelivery = useConfirmDelivery();
  const startRide = useStartRide();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  const { detail, mode } = model;
  const needsCode = mode === "delivery_code";
  const filled = code.length === CODE_LENGTH;
  const canConfirm = needsCode ? filled : true;
  const deadline = dropBy(detail.orderDate);
  const away =
    here && detail.coordinates
      ? formatDistance(distanceKm(here, detail.coordinates))
      : null;

  async function onConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmDelivery({
        mode,
        shipmentId,
        orderId: model.orderId,
        code,
      });
      if (result.ok) {
        // Home, not the Deliveries list: the next job, if there is one, is
        // already waiting at the top of it.
        router.replace("/(tabs)");
        return;
      }
      setError(
        result.invalidCode
          ? "That code doesn’t match this order."
          : (result.message ?? "Could not confirm the delivery."),
      );
      if (result.invalidCode) setCode("");
    } catch {
      setError("Could not confirm the delivery. Check your connection.");
    } finally {
      setConfirming(false);
    }
  }

  async function onRide() {
    setError(null);
    if (canStartRide(detail.status)) {
      setStarting(true);
      try {
        await startRide(shipmentId);
      } catch {
        setError("Couldn’t start the ride. Check your connection.");
        return;
      } finally {
        setStarting(false);
      }
    }
    router.push(`/delivery/${shipmentId}/ride`);
  }

  const assigned =
    detail.assignedAt !== null
      ? `Order #${detail.reference} · assigned ${formatClock(detail.assignedAt)}`
      : `Order #${detail.reference}`;

  return (
    <View className="flex-1 bg-background">
      <DetailHeader title="Delivery details" subtitle={assigned} />
      <Screen>
        <View className="gap-[14px] pb-space-7 pt-space-3">
          <StepTrack status={detail.status} />

          {/* The map and the facts under it, as one card. */}
          <View className="overflow-hidden rounded-lg border border-border bg-on-brand-pill">
            {/*
              A real map, and only when the address actually carries usable
              coordinates. The reference app computed route statistics against
              the maps library's default origin — in Singapore — so every
              distance a Nairobi rider saw was wrong.
            */}
            {detail.coordinates ? (
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ height: 190 }}
                initialRegion={{
                  ...detail.coordinates,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                showsUserLocation
                pointerEvents="none"
              >
                <Marker
                  coordinate={detail.coordinates}
                  title={detail.customerName}
                  description={detail.addressLine}
                />
              </MapView>
            ) : (
              <View className="h-[190px] items-center justify-center bg-ink-900">
                <Text size="sm" className="text-white/70">
                  No location on this order
                </Text>
              </View>
            )}
            <View className="gap-space-4 p-[14px]">
              <View className="flex-row gap-space-5">
                <Fact label="Distance" value={away ? `${away} away` : "—"} />
                <Fact
                  label="Drop by"
                  value={deadline !== null ? formatClock(deadline) : "—"}
                />
                <Fact label="Items" value={String(detail.itemCount)} />
              </View>
              {detail.coordinates ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open directions in Google Maps"
                  onPress={() =>
                    void Linking.openURL(directionsUrl(detail.coordinates!))
                  }
                  className="h-[44px] flex-row items-center justify-center gap-space-3 rounded-pill bg-primary active:opacity-90"
                >
                  <Icon name="navigate-outline" size={16} tone="onBrand" />
                  <Text size="sm" weight="semibold" className="text-primary-foreground">
                    View full map
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {canStartRide(detail.status) || isOnTheWay(detail.status) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void onRide()}
              disabled={starting}
              className={cn(
                "h-control-lg flex-row items-center justify-center gap-[9px] rounded-pill bg-on-brand-pill active:scale-[0.96]",
                starting && "opacity-60",
              )}
            >
              <Icon name="bicycle" size={19} tone="brand" />
              <Text weight="semibold" className="text-[15px] text-primary">
                {isOnTheWay(detail.status) ? "Back to the ride" : "Start the ride"}
              </Text>
            </Pressable>
          ) : null}

          <CustomerCard
            name={detail.customerName}
            phone={detail.customerPhone}
            address={detail.addressLine}
            note={detail.note}
          />

          <ItemsCard
            items={detail.items}
            itemCount={detail.itemCount}
            paymentLabel={detail.paymentLabel}
            total={detail.total}
          />

          {/*
            Which confirmation the backend will accept depends on the order's
            payment mode: verifyDeliveryCode throws for anything that is not
            pay_now, so a payment-on-delivery order has no code to ask for.
            Asking for one the backend would reject leaves the rider stuck at
            the door with no way forward.
          */}
          <View className="gap-space-4 rounded-lg border border-border bg-card p-space-5">
            {needsCode ? (
              <>
                <View>
                  <Text size="h4" weight="bold" className="text-strong">
                    Ask the customer for their {CODE_LENGTH}-digit code
                  </Text>
                  <Text size="sm" variant="subtle">
                    It is in their order-tracking screen.
                  </Text>
                </View>
                <OtpInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setError(null);
                  }}
                  length={CODE_LENGTH}
                  invalid={error !== null}
                  editable={!confirming}
                />
              </>
            ) : (
              <View>
                <Text size="h4" weight="bold" className="text-strong">
                  Collect payment at the door
                </Text>
                <Text size="sm" variant="subtle">
                  Take {formatMoney(detail.total)} before handing the order
                  over, then confirm below.
                </Text>
              </View>
            )}

            {error ? (
              <Text variant="destructive" size="sm">
                {error}
              </Text>
            ) : null}

            <Button
              full
              size="ctaLg"
              label={
                needsCode && !filled
                  ? `Enter the ${CODE_LENGTH}-digit code`
                  : "Confirm delivery"
              }
              loading={confirming}
              disabled={!canConfirm}
              icon={<Icon name="checkmark-circle" size={19} tone="onBrand" />}
              onPress={() => void onConfirm()}
            />
          </View>
        </View>
      </Screen>
    </View>
  );
}

/** One of the three facts in the map card's ink footer. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text
        weight="semibold"
        className="text-[10px] uppercase leading-[13px] tracking-label text-white/60"
      >
        {label.toUpperCase()}
      </Text>
      <Text size="base" weight="bold" className="text-white">
        {value}
      </Text>
    </View>
  );
}
