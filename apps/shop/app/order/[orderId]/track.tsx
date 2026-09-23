import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Button } from "@repo/mobile-ui/components/ui/button";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { Icon } from "../../../components/icon";
import { ScreenHeader } from "../../../components/screen-header";
import { NotFoundState } from "../../../components/states";
import { RiderCard } from "../../../components/order/rider-card";
import { formatKES } from "../../../lib/format";
import { supportLinkForOrder } from "@repo/lib/utils";
import {
  ORDER_JOURNEY,
  isLive,
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
 * condition. Before a rider has collected the order their location says
 * nothing about the delivery; it is just where a person happens to be.
 *
 * ── Layout ───────────────────────────────────────────────────────────────
 *
 * Per the tracking design: a numbered rail with the current step expanded,
 * the delivery-code reminder, and the order folded away under "Order
 * details" — the customer came here to ask where it is, not what it was. The
 * rider card is kept from the previous version (the design predates it) and
 * shares its component with the order screen. Contact support sits in the
 * footer, pointed wherever a super admin set it on the dashboard, and is left
 * out entirely when no link is set.
 */
export default function TrackOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = orderId as Id<"orders"> | undefined;

  const tracking = useQuery(
    api.data.tracking.getMyOrderTracking,
    id ? { orderId: id } : "skip",
  );
  const order = useQuery(
    api.data.orders.getMyOrder,
    id ? { orderId: id } : "skip",
  );
  // Set by a super admin under Settings → Customer support. Null hides the
  // button: one that opens nothing is worse than none.
  const supportLink = useQuery(api.data.platform_settings.getSupportLink);

  if (tracking === undefined) return <TrackSkeleton />;
  if (tracking === null) {
    return (
      <NotFoundState what="order" onBack={() => router.replace("/orders")} />
    );
  }

  const status = presentStatus(tracking.orderStatus);
  const live = isLive(tracking.orderStatus);
  const support = order
    ? supportLinkForOrder(supportLink, order.reference)
    : null;

  return (
    <SafeAreaView edges={["top"]} className="bg-card flex-1">
      <ScreenHeader eyebrow="Tracking" title={status.label} />

      <ScrollView
        className="bg-muted flex-1"
        contentContainerClassName="px-screen pb-space-8 gap-[12px] pt-space-5"
      >
        {/*
          Off-track statuses get no rail: five steps with none reachable is
          worse than not drawing it.
        */}
        {status.step === null ? (
          <View
            className={`gap-[6px] rounded-[20px] p-[20px] ${
              tracking.orderStatus === "Cancelled"
                ? "bg-destructive-soft"
                : "bg-card"
            }`}
          >
            <RNText className="text-foreground text-[16px] leading-[23px] font-semibold">
              {status.label}
            </RNText>
            {status.helper ? (
              <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
                {status.helper}
              </RNText>
            ) : null}
          </View>
        ) : (
          <View className="bg-card rounded-[20px] px-[20px] pt-[20px] pb-[4px]">
            {ORDER_JOURNEY.map((step, index) => (
              <JourneyStep
                key={step}
                status={step as OrderStatus}
                number={index + 1}
                current={status.step!}
                isLast={index === ORDER_JOURNEY.length - 1}
              />
            ))}
          </View>
        )}

        {tracking.deliveryCodeRequired && live ? (
          <View className="bg-blink-100 gap-[6px] rounded-[20px] p-[20px]">
            <RNText className="text-ink-950 text-[16px] leading-[23px] font-semibold">
              You will need your delivery code
            </RNText>
            <RNText className="text-ink-950 font-sans text-[13px] leading-[19px]">
              The rider will ask for the six-digit code we sent you — it is also
              on your order screen. Do not share it before your order is in your
              hands.
            </RNText>
          </View>
        ) : null}

        <RiderCard tracking={tracking} live={live} />

        {order ? (
          <OrderDetails
            reference={order.reference}
            total={order.total_amount}
            items={order.items.map((i) => `${i.quantity}× ${i.name}`)}
            place={
              [order.address?.city, order.address?.country]
                .filter(Boolean)
                .join(", ") || null
            }
            onOpen={() => router.push(`/order/${order._id}`)}
          />
        ) : null}
      </ScrollView>

      {support ? (
        <View className="border-t-hairline border-border bg-card px-screen py-[14px]">
          <Button
            variant="outline"
            size="cta"
            full
            label="Contact support"
            onPress={() => void Linking.openURL(support)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * One step of the rail. Done and current are brand yellow; done shows a tick,
 * everything else its number. Only the current step carries its explanation,
 * so the rail reads as a list of places with one "you are here".
 */
function JourneyStep({
  status,
  number,
  current,
  isLast,
}: {
  status: OrderStatus;
  number: number;
  current: number;
  isLast: boolean;
}) {
  const done = number < current;
  const active = number === current;
  const presented = presentStatus(status);

  return (
    <View
      className="flex-row gap-[14px]"
      accessibilityLabel={`Step ${number}, ${presented.label}${
        done ? ", done" : active ? ", current" : ""
      }`}
    >
      <View className="items-center">
        <View
          className={`size-[32px] items-center justify-center rounded-[999px] ${
            done || active ? "bg-primary" : "bg-muted"
          }`}
        >
          {done ? (
            <Icon name="checkmark" size={16} tone="onBrand" />
          ) : (
            <RNText
              className={`text-[13px] leading-[17px] font-bold ${
                active ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {number}
            </RNText>
          )}
        </View>
        {!isLast ? (
          <View className="bg-border mt-[2px] min-h-[28px] w-[2px] flex-1" />
        ) : null}
      </View>

      <View className="flex-1 gap-[4px] pb-[24px]">
        <RNText
          className={
            active
              ? "text-foreground text-[16px] leading-[23px] font-bold"
              : `text-[15px] leading-[22px] font-semibold ${
                  done ? "text-foreground" : "text-muted-foreground"
                }`
          }
        >
          {presented.label}
        </RNText>
        {active && presented.helper ? (
          <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
            {presented.helper}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

/** The order, folded away until asked for. */
function OrderDetails({
  reference,
  total,
  items,
  place,
  onOpen,
}: {
  reference: string;
  total: number;
  items: string[];
  place: string | null;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View className="bg-card overflow-hidden rounded-[20px]">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between p-[16px] active:opacity-70"
      >
        <RNText className="text-foreground text-[15px] leading-[22px] font-semibold">
          Order details
        </RNText>
        <Icon
          name={open ? "chevron-down" : "chevron-forward"}
          size={18}
          tone="body"
        />
      </Pressable>

      {open ? (
        <View className="border-t-hairline border-border gap-[8px] px-[16px] pt-[12px] pb-[16px]">
          <View className="flex-row justify-between gap-[12px]">
            <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
              Order
            </RNText>
            <RNText
              numberOfLines={1}
              ellipsizeMode="middle"
              className="text-muted-foreground shrink font-sans text-[13px] leading-[19px]"
            >
              {reference}
            </RNText>
          </View>
          <View className="flex-row justify-between gap-[12px]">
            {/* No vendor name — which shop fulfilled this is a Blink detail. */}
            <RNText
              numberOfLines={1}
              className="text-foreground shrink font-sans text-[15px] leading-[22px]"
            >
              Your order
            </RNText>
            <RNText className="text-foreground font-sans text-[15px] leading-[22px]">
              {formatKES(total)}
            </RNText>
          </View>
          <View className="flex-row justify-between gap-[12px]">
            <RNText
              numberOfLines={2}
              className="text-muted-foreground shrink font-sans text-[13px] leading-[19px]"
            >
              {items.join(", ")}
            </RNText>
            {place ? (
              <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
                {place}
              </RNText>
            ) : null}
          </View>
          <Pressable
            onPress={onOpen}
            accessibilityRole="link"
            hitSlop={8}
            className="flex-row items-center gap-[4px] pt-[4px] active:opacity-70"
          >
            <RNText className="text-foreground text-[13px] leading-[19px] font-semibold">
              View full order
            </RNText>
            <Icon name="chevron-forward" size={14} tone="strong" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TrackSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-card flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[22px] w-1/2 rounded-sm" />
      </View>
      <View className="bg-muted px-screen pt-space-5 flex-1 gap-[12px]">
        <View className="bg-card gap-[20px] rounded-[20px] p-[20px]">
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} className="flex-row items-center gap-[14px]">
              <Skeleton className="size-[32px] rounded-[999px]" />
              <Skeleton className="h-[15px] w-1/2 rounded-sm" />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
