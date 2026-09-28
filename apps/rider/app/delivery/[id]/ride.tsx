import { useEffect, useRef } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import type { Id } from "@repo/backend/dataModel";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { ClockPill } from "../../../components/job/ClockPill";
import { ContactButtons } from "../../../components/job/ContactButtons";
import { itemCountLabel } from "../../../components/job/ItemList";
import { useDelivery } from "../../../lib/data";
import { dropBy } from "../../../lib/earnings";
import { formatClock, formatMoney, initials } from "../../../lib/format";
import { directionsUrl, distanceKm, formatDistance } from "../../../lib/geo";
import { useDeviceLocation } from "../../../lib/use-device-location";
import { useNow } from "../../../lib/use-now";

/**
 * On the way: the map, the clock, and the customer — nothing else.
 *
 * Per the design, the whole screen is the map, with the drop-by clock
 * floating over it and the customer in a sheet at the foot. It is the screen a
 * rider glances at on the move, so it carries the three things worth a glance
 * and hands off to the phone's own maps app for turn-by-turn, which is the
 * only place a real road route and arrival time can come from.
 *
 * "Mark as completed" goes back to the delivery screen rather than finishing
 * here, as in the design: completing needs the customer's code, and that
 * belongs at the door with the order in hand, not on the move.
 */
export default function RideRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shipmentId = (id ?? null) as Id<"shipments"> | null;
  const model = useDelivery(shipmentId);
  const here = useDeviceLocation();
  const now = useNow();
  const map = useRef<MapView>(null);
  const framed = useRef(false);

  const detail = model ? model.detail : null;
  const drop = detail?.coordinates ?? null;

  /** Fit the rider and the drop in view, with room for the header and sheet. */
  function recentre(animated = true) {
    if (!map.current || !drop) return;
    map.current.fitToCoordinates(here ? [here, drop] : [drop], {
      edgePadding: { top: 180, right: 60, bottom: 380, left: 60 },
      animated,
    });
  }

  // Frame once, when the first fix arrives, and then leave the map alone: a
  // map that re-centres itself every 25 m fights the rider's own panning.
  useEffect(() => {
    if (framed.current || !here || !drop) return;
    framed.current = true;
    recentre(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, drop]);

  if (model === undefined) {
    return (
      <View className="flex-1 bg-ink-900 p-screen" style={{ paddingTop: insets.top + 16 }}>
        <Skeleton className="h-space-8 w-[160px]" />
      </View>
    );
  }
  if (model === null || !detail || !shipmentId) {
    // Reassigned or gone while the rider was on this screen. Said plainly,
    // with a way back, rather than navigating away mid-render.
    return (
      <View
        className="flex-1 items-center justify-center gap-space-4 bg-ink-900 px-space-8"
        style={{ paddingTop: insets.top }}
      >
        <Text size="h4" weight="bold" className="text-center text-white">
          This delivery is no longer yours
        </Text>
        <Text size="sm" className="text-center text-white/70">
          It may have been reassigned to another rider.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/(tabs)")}
          className="h-control items-center justify-center rounded-pill bg-primary px-space-7 active:opacity-90"
        >
          <Text size="sm" weight="semibold" className="text-primary-foreground">
            Back to home
          </Text>
        </Pressable>
      </View>
    );
  }

  const deadline = dropBy(detail.orderDate);
  const away = here && drop ? formatDistance(distanceKm(here, drop)) : null;

  return (
    <View className="flex-1 bg-ink-900">
      {drop ? (
        <MapView
          ref={map}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...drop, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          <Marker
            coordinate={drop}
            title={detail.customerName}
            description={detail.addressLine}
          />
        </MapView>
      ) : (
        <View className="absolute inset-0 items-center justify-center">
          <Text size="sm" className="text-white/70">
            No location on this order
          </Text>
        </View>
      )}

      {/* The header, over a fade so it reads on any map tile. */}
      <LinearGradient
        colors={["rgba(10,14,22,0.92)", "rgba(10,14,22,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        pointerEvents="box-none"
      >
        <View
          className="flex-row items-center gap-space-4 px-screen pb-[28px]"
          style={{ paddingTop: insets.top + 14 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to delivery details"
            onPress={() => router.back()}
            className="size-[40px] items-center justify-center rounded-pill bg-primary active:opacity-90"
          >
            <Icon name="arrow-back" size={19} tone="onBrand" />
          </Pressable>
          <View className="flex-1">
            <Text size="h4" weight="bold" className="text-white">
              On the way
            </Text>
            <Text size="label" numberOfLines={1} className="text-white/70">
              Order #{detail.reference} &middot; {detail.addressLine}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View
        className="absolute left-0 right-0 items-center"
        style={{ top: insets.top + 84 }}
        pointerEvents="none"
      >
        <ClockPill deadline={deadline} now={now} size="lg" />
      </View>

      <View
        className="absolute left-space-4 right-space-4 gap-space-4"
        style={{ bottom: Math.max(insets.bottom, 12) }}
      >
        {drop ? (
          <View className="flex-row justify-end gap-[10px]">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recentre map"
              onPress={() => recentre()}
              className="size-[46px] items-center justify-center rounded-pill bg-card shadow-md active:opacity-90"
            >
              <Icon name="locate-outline" size={20} tone="strong" />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open directions in Google Maps"
              onPress={() => void Linking.openURL(directionsUrl(drop))}
              className="size-[46px] items-center justify-center rounded-pill bg-on-brand-pill shadow-md active:opacity-90"
            >
              <Icon name="expand-outline" size={19} tone="brand" />
            </Pressable>
          </View>
        ) : null}

        <View className="gap-[14px] rounded-xl bg-card p-space-5 shadow-lg">
          <View className="flex-row items-center justify-between gap-space-4">
            <View className="flex-1 flex-row items-center gap-space-4">
              <View className="size-[44px] items-center justify-center rounded-pill bg-secondary">
                <Text size="base" weight="bold" className="text-strong">
                  {initials(detail.customerName)}
                </Text>
              </View>
              <View className="flex-1">
                <Text size="h4" weight="bold" numberOfLines={1} className="text-strong">
                  {detail.customerName}
                </Text>
                <Text size="sm" variant="subtle" numberOfLines={1}>
                  Customer{detail.customerPhone ? ` · ${detail.customerPhone}` : ""}
                </Text>
              </View>
            </View>
            <ContactButtons phone={detail.customerPhone} name={detail.customerName} />
          </View>

          <View className="flex-row gap-[10px]">
            <Tile
              icon="location-outline"
              label="Distance"
              value={away ? `${away} away` : "—"}
            />
            <Tile
              icon="time-outline"
              label="Drop by"
              value={deadline !== null ? formatClock(deadline) : "—"}
            />
          </View>

          <View className="flex-row items-center justify-between gap-[10px] rounded-md border border-blink-200 bg-accent px-[14px] py-space-4">
            <Text size="sm" numberOfLines={1} className="flex-1 text-foreground">
              {itemCountLabel(detail.itemCount)} &middot; {detail.paymentLabel}
            </Text>
            <Text size="sm" weight="bold" className="text-price">
              {formatMoney(detail.total)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              // Back to the delivery screen already in the stack, rather than
              // pushing a second copy of it on top of this one.
              router.navigate({
                pathname: "/delivery/[id]",
                params: { id: shipmentId },
              })
            }
            className="h-control-lg items-center justify-center rounded-pill bg-on-brand-pill active:scale-[0.96]"
          >
            <Text weight="semibold" className="text-[15px] text-primary">
              Mark as completed
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: "location-outline" | "time-outline";
  label: string;
  value: string;
}) {
  return (
    <View className="flex-1 flex-row items-center gap-[10px] rounded-md border border-border p-space-4">
      <Icon name={icon} size={18} tone="body" />
      <View className="flex-1">
        <Text size="caption" variant="subtle">
          {label}
        </Text>
        <Text size="sm" weight="bold" numberOfLines={1} className="text-strong">
          {value}
        </Text>
      </View>
    </View>
  );
}
