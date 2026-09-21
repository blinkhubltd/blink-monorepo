import { useState } from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { Button } from "@repo/mobile-ui/components/ui/button";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { Icon, type IconName } from "../../../components/icon";
import { ScreenHeader } from "../../../components/screen-header";
import { NotFoundState } from "../../../components/states";
import { SectionCard } from "../../../components/checkout/sections";
import { RiderCard } from "../../../components/order/rider-card";
import { formatKES } from "../../../lib/format";
import {
  STAGE_PILL,
  isLive,
  orderStage,
  presentStatus,
} from "../../../lib/order-status";

/**
 * One order: what is coming, who is bringing it, and the code for the door.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The flow this replaces did `Alert.alert("Success", …)` and then
 * `router.replace("/")`, unawaited — so the customer landed on the home screen
 * with no order id, no reference and no way back to what they had bought.
 * Checkout replaces to here instead.
 *
 * ── What the old app showed, and where it went ────────────────────────────
 *
 * blink-ecommerce split this across an order-details screen and a tracking
 * screen. Carried over, in the checkout design's card language:
 *
 *   - the delivery code, hidden until asked for, pay-now orders only;
 *   - the rider — photo, name, rating, vehicle, and a call button;
 *   - the full address, receiver and instructions;
 *   - payment method, order date and the reference.
 *
 * The rider comes from `tracking.getMyOrderTracking`, not from this screen's
 * own query, so there is one place deciding what a customer may see of a rider:
 * first name only, and the phone and plate only while the parcel is actually
 * on its way.
 */
export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = orderId as Id<"orders"> | undefined;

  const order = useQuery(
    api.data.orders.getMyOrder,
    id ? { orderId: id } : "skip",
  );
  const tracking = useQuery(
    api.data.tracking.getMyOrderTracking,
    id ? { orderId: id } : "skip",
  );
  // Siblings from the same basket, found by the reference they share.
  const siblings = useQuery(
    api.data.orders.getMyOrdersByReference,
    order?.payment_reference ? { reference: order.payment_reference } : "skip",
  );

  // Loading before absent, always.
  if (order === undefined) return <OrderSkeleton />;
  if (order === null) {
    return (
      <NotFoundState what="order" onBack={() => router.replace("/orders")} />
    );
  }

  const others = (siblings ?? []).filter((o) => o._id !== order._id);
  const basketTotal = (siblings ?? []).reduce(
    (sum, o) => sum + o.total_amount,
    0,
  );
  const paid = order.payment_status === "Paid";
  const live = isLive(order.order_status);
  const stage = orderStage(order.order_status);

  const addressLines = [order.address?.address_1, order.address?.address_2]
    .map((line) => line?.trim())
    .filter(Boolean) as string[];
  const cityLine = [order.address?.city, order.address?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <SafeAreaView edges={["top"]} className="bg-card flex-1">
      <ScreenHeader
        eyebrow="Order"
        code={order.reference}
        title={order.vendor?.name ?? "Your order"}
      />

      <ScrollView
        className="bg-muted flex-1"
        contentContainerClassName="px-screen pb-space-8 gap-[12px] pt-space-5"
      >
        <StatusBanner
          status={order.order_status}
          paid={paid}
          total={order.total_amount}
        />

        {order.payment_mode === "pay_now" && !order.delivery_code_verified ? (
          <DeliveryCodeCard code={order.delivery_code ?? null} />
        ) : null}

        <RiderCard tracking={tracking ?? null} live={live} />

        {/*
          Named when a basket became several deliveries, rather than leaving
          the customer to work it out from their order history.
        */}
        {others.length > 0 ? (
          <SectionCard title={`${others.length + 1} deliveries in this basket`}>
            <Body muted>One per shop. Each arrives separately.</Body>
            {others.map((other) => (
              <Pressable
                key={other._id}
                onPress={() => router.replace(`/order/${other._id}`)}
                accessibilityRole="button"
                className="flex-row items-center gap-[8px] active:opacity-70"
              >
                <RNText
                  numberOfLines={1}
                  className="text-foreground flex-1 font-sans text-[14px] leading-[21px]"
                >
                  {other.reference}
                </RNText>
                <RNText className="text-foreground font-sans text-[14px] leading-[21px]">
                  {formatKES(other.total_amount)}
                </RNText>
                <Icon name="chevron-forward" size={16} tone="body" />
              </Pressable>
            ))}
            <Divider />
            <Row label="Basket total" value={formatKES(basketTotal)} strong />
          </SectionCard>
        ) : null}

        <SectionCard title="What is coming">
          {order.items.map((item) => (
            <Row
              key={item._id}
              label={`${item.quantity}× ${item.name}`}
              value={formatKES(item.total)}
            />
          ))}
          <Divider />
          <Row label="Subtotal" value={formatKES(order.subtotal_amount)} />
          {order.discount_amount > 0 ? (
            <Row
              label="Discount"
              value={`−${formatKES(order.discount_amount)}`}
            />
          ) : null}
          <Row
            label="Delivery"
            value={
              order.delivery_fee === 0 ? "Free" : formatKES(order.delivery_fee)
            }
          />
          <Divider />
          <Row
            label={paid ? "Paid" : "To pay on delivery"}
            value={formatKES(order.total_amount)}
            strong
          />
        </SectionCard>

        <SectionCard title="Delivering to">
          <View className="gap-[2px]">
            {addressLines.length > 0 ? (
              addressLines.map((line) => (
                <RNText
                  key={line}
                  className="text-foreground font-sans text-[15px] leading-[22px]"
                >
                  {line}
                </RNText>
              ))
            ) : (
              <RNText className="text-foreground font-sans text-[15px] leading-[22px]">
                Address not recorded
              </RNText>
            )}
            {cityLine ? <Body muted>{cityLine}</Body> : null}
          </View>

          {order.receiver_contact ? (
            <View className="gap-[2px]">
              <Label>Receiver</Label>
              <Body>
                {order.receiver_contact.name} · {order.receiver_contact.phone}
              </Body>
            </View>
          ) : null}

          {order.special_instructions ? (
            <View className="gap-[2px]">
              <Label>Instructions</Label>
              <Body>{order.special_instructions}</Body>
            </View>
          ) : null}

          <View className="flex-row flex-wrap gap-[8px]">
            <Pill
              label={stage}
              bg={STAGE_PILL[stage].bg}
              fg={STAGE_PILL[stage].fg}
            />
            <Pill
              label={order.payment_status}
              bg={paid ? "bg-success-soft" : "bg-muted"}
              fg={paid ? "text-success" : "text-foreground"}
            />
          </View>
        </SectionCard>

        <SectionCard title="Order details">
          <Row
            label="Placed"
            value={new Date(order.order_date).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <Row label="Payment" value={order.payment_method} />
          {order.payment_mode === "pay_now" && order.delivery_code_verified ? (
            <Row label="Delivery code" value="Verified at the door" />
          ) : null}
          <View className="gap-[2px]">
            <Label>Reference</Label>
            <RNText
              selectable
              className="text-foreground font-sans text-[14px] leading-[21px]"
            >
              {order.reference}
            </RNText>
          </View>
        </SectionCard>
      </ScrollView>

      {/* Pinned, as in the design: the next thing to do, then a way out. */}
      <View className="border-t-hairline border-border bg-card px-screen gap-[10px] py-[14px]">
        {order.order_status === "Delivered" ? (
          <Button
            size="cta"
            full
            variant={order.rider_rating ? "outline" : "default"}
            label={
              order.rider_rating
                ? "You rated this delivery"
                : "Rate your delivery"
            }
            onPress={() => router.push(`/order/${order._id}/rate`)}
          />
        ) : live ? (
          <Button
            size="cta"
            full
            label="Track this order"
            onPress={() => router.push(`/order/${order._id}/track`)}
          />
        ) : null}
        <Button
          variant="ghost"
          size="ctaSm"
          full
          label="Keep shopping"
          onPress={() => router.replace("/")}
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * The headline: where the order is, in the customer's words.
 *
 * Green once money has changed hands or the parcel has arrived, the brand wash
 * while a pay-on-delivery order is still coming — it is not a problem, just a
 * payment still to make — and red or grey once the order has left the track.
 */
function StatusBanner({
  status,
  paid,
  total,
}: {
  status: string;
  paid: boolean;
  total: number;
}) {
  const presented = presentStatus(status);

  let tone: {
    bg: string;
    title: string;
    body: string;
    icon: IconName;
    iconTone: "success" | "destructive" | "body" | "strong";
  };
  let title = presented.label;
  let body = presented.helper;

  if (status === "Cancelled") {
    tone = {
      bg: "bg-destructive-soft",
      title: "text-destructive",
      body: "text-destructive",
      icon: "close-circle",
      iconTone: "destructive",
    };
  } else if (status === "Refunded") {
    tone = {
      bg: "bg-card",
      title: "text-foreground",
      body: "text-muted-foreground",
      icon: "return-down-back",
      iconTone: "body",
    };
  } else if (paid || status === "Delivered") {
    tone = {
      bg: "bg-success-soft",
      title: "text-success",
      body: "text-success",
      icon: "checkmark-circle",
      iconTone: "success",
    };
    if (status === "Pending" || status === "Confirmed") {
      title = "Paid and confirmed";
      body = "We have your payment and the shop is preparing your order.";
    }
  } else {
    tone = {
      bg: "bg-accent",
      title: "text-foreground",
      body: "text-muted-foreground",
      icon: "time-outline",
      iconTone: "strong",
    };
    body =
      `${presented.helper} Pay the rider ${formatKES(total)} when it arrives.`.trim();
  }

  return (
    <View
      className={`${tone.bg} flex-row items-start gap-[12px] rounded-[20px] p-[20px]`}
    >
      <View className="mt-[1px]">
        <Icon name={tone.icon} size={22} tone={tone.iconTone} />
      </View>
      <View className="flex-1 gap-[4px]">
        <RNText
          className={`${tone.title} text-[16px] leading-[23px] font-semibold`}
        >
          {title}
        </RNText>
        {body ? (
          <RNText
            className={`${tone.body} font-sans text-[13px] leading-[19px]`}
          >
            {body}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The proof-of-delivery code, for pay-now orders.
 *
 * Hidden until asked for, as the old app did: it is the one thing that lets
 * someone else receive this parcel, and a screen left open on a counter should
 * not display it. Once the rider has verified it, this card is replaced by a
 * line in the order details.
 */
function DeliveryCodeCard({ code }: { code: string | null }) {
  const [visible, setVisible] = useState(false);

  return (
    <SectionCard
      title="Delivery code"
      action={
        code ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              visible ? "Hide delivery code" : "Show delivery code"
            }
            hitSlop={8}
            className="flex-row items-center gap-[4px] active:opacity-70"
          >
            <Icon
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={16}
              tone="strong"
            />
            <RNText className="text-foreground text-[13px] leading-[19px] font-semibold">
              {visible ? "Hide" : "Show"}
            </RNText>
          </Pressable>
        ) : null
      }
    >
      {code ? (
        <>
          <View className="border-border items-center rounded-[14px] border-[1.5px] py-[14px]">
            <RNText
              selectable={visible}
              accessibilityLabel={
                visible
                  ? `Delivery code ${code.split("").join(" ")}`
                  : "Delivery code hidden"
              }
              className="text-foreground text-[28px] leading-[34px] font-semibold tracking-[6px]"
            >
              {visible ? code : "•".repeat(code.length)}
            </RNText>
          </View>
          <Body muted>
            Read this to the rider when they hand you your order. Do not share
            it before then — it is what confirms you received it.
          </Body>
        </>
      ) : (
        <Body muted>
          Your code will appear here once your payment is confirmed. You will
          read it to the rider at the door.
        </Body>
      )}
    </SectionCard>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const font = strong
    ? "font-semibold text-[16px] leading-[23px]"
    : "font-sans text-[14px] leading-[21px]";
  return (
    <View className="flex-row items-baseline justify-between gap-[12px]">
      <RNText numberOfLines={2} className={`text-foreground shrink ${font}`}>
        {label}
      </RNText>
      <RNText className={`text-foreground ${font}`}>{value}</RNText>
    </View>
  );
}

function Divider() {
  return <View className="bg-border h-[1px]" />;
}

function Body({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <RNText
      className={`font-sans text-[13px] leading-[19px] ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {children}
    </RNText>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <RNText className="text-muted-foreground tracking-label text-[11px] leading-[15px] font-medium uppercase">
      {children}
    </RNText>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View className={`${bg} rounded-[999px] px-[14px] py-[6px]`}>
      <RNText className={`${fg} text-[13px] leading-[17px] font-semibold`}>
        {label}
      </RNText>
    </View>
  );
}

function OrderSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-card flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[14px] w-2/5 rounded-sm" />
        <Skeleton className="h-[22px] w-3/5 rounded-sm" />
      </View>
      <View className="bg-muted px-screen pt-space-5 flex-1 gap-[12px]">
        <Skeleton className="h-[84px] w-full rounded-[20px]" />
        <Skeleton className="h-[160px] w-full rounded-[20px]" />
        <Skeleton className="h-[120px] w-full rounded-[20px]" />
      </View>
    </SafeAreaView>
  );
}
