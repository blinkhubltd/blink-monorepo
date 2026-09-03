import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { CheckCircle2 } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../../components/screen-header";
import { NotFoundState } from "../../../components/states";
import { formatKES } from "../../../lib/format";

/**
 * One order — and the confirmation screen the old flow did not have.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The screen this replaces did, on success:
 *
 *     Alert.alert("Success", "Order placed and payment confirmed.");
 *     router.replace("/");
 *
 * The alert was not awaited, so the customer was already on the home screen
 * when it appeared, and every piece of order context was gone — no order id, no
 * reference, no total, no way back to what they had just bought. Dismiss it
 * while the app was backgrounded and there was no confirmation at all that the
 * money had bought anything.
 *
 * Checkout replaces to here instead. A basket spanning several shops shows every
 * delivery it became, because the customer bought one basket and should not have
 * to deduce that it turned into three orders.
 */
export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const order = useQuery(
    api.data.orders.getMyOrder,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip",
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

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Order"
        title={order.reference}
        subtitle={order.vendor?.name ?? undefined}
        showCart={false}
      />

      <ScrollView contentContainerClassName="px-screen gap-space-5 pb-space-10">
        <View className="bg-success-soft gap-space-2 p-space-5 flex-row items-start rounded-lg">
          <CheckCircle2 size={22} color="#159B62" />
          <View className="gap-space-1 flex-1">
            <Text size="base" weight="semibold">
              {order.payment_status === "Paid"
                ? "Paid and confirmed"
                : "Order confirmed"}
            </Text>
            <Text size="sm">
              {order.payment_status === "Paid"
                ? "We have your payment and the shop is preparing your order."
                : "Pay the rider when your order arrives."}
            </Text>
          </View>
        </View>

        {/*
          Named up front when a basket became several deliveries, rather than
          leaving the customer to work it out from their order history.
        */}
        {others.length > 0 ? (
          <View className="border-hairline border-border gap-space-3 p-space-4 rounded-lg">
            <Text size="sm" weight="semibold">
              This basket is arriving as {others.length + 1} deliveries
            </Text>
            <Text size="caption" variant="subtle">
              One per shop. Each arrives separately.
            </Text>
            {others.map((other) => (
              <Button
                key={other._id}
                variant="outline"
                size="sm"
                label={`${other.reference} · ${formatKES(other.total_amount)}`}
                onPress={() => router.replace(`/order/${other._id}`)}
              />
            ))}
            <Separator />
            <View className="flex-row items-baseline justify-between">
              <Text size="sm" variant="muted">
                Basket total
              </Text>
              <Text size="sm" weight="semibold">
                {formatKES(basketTotal)}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="gap-space-3">
          <Text size="base" weight="semibold">
            What is coming
          </Text>
          {order.items.map((item) => (
            <View
              key={item._id}
              className="gap-space-3 flex-row items-start justify-between"
            >
              <View className="gap-space-2 flex-1 flex-row">
                <Text size="sm" variant="muted">
                  {item.quantity}×
                </Text>
                <Text size="sm" numberOfLines={2} className="flex-1">
                  {item.name}
                </Text>
              </View>
              <Text size="sm" weight="medium">
                {formatKES(item.total)}
              </Text>
            </View>
          ))}
        </View>

        <Separator />

        <View className="gap-space-2">
          <Row label="Subtotal" value={formatKES(order.subtotal_amount)} />
          <Row
            label="Delivery"
            value={
              order.delivery_fee === 0 ? "Free" : formatKES(order.delivery_fee)
            }
          />
          <Separator />
          <View className="flex-row items-baseline justify-between">
            <Text size="base" weight="semibold">
              {order.payment_status === "Paid" ? "Paid" : "To pay on delivery"}
            </Text>
            <Text variant="price" size="priceLg">
              {formatKES(order.total_amount)}
            </Text>
          </View>
        </View>

        <Separator />

        <View className="gap-space-2">
          <Text size="base" weight="semibold">
            Delivering to
          </Text>
          <Text size="sm" variant="muted">
            {order.address?.address_1 ?? "Address not recorded"}
          </Text>
          {order.address?.city ? (
            <Text size="caption" variant="subtle">
              {order.address.city}
              {order.address.country ? `, ${order.address.country}` : ""}
            </Text>
          ) : null}
          {order.receiver_contact ? (
            <View className="gap-space-1 pt-space-2">
              <Text size="caption" variant="eyebrow">
                Receiver
              </Text>
              <Text size="sm">
                {order.receiver_contact.name} · {order.receiver_contact.phone}
              </Text>
            </View>
          ) : null}
          {order.special_instructions ? (
            <View className="gap-space-1 pt-space-2">
              <Text size="caption" variant="eyebrow">
                Instructions
              </Text>
              <Text size="sm">{order.special_instructions}</Text>
            </View>
          ) : null}
        </View>

        <View className="gap-space-2 flex-row flex-wrap">
          <Badge variant="secondary" label={order.order_status} />
          <Badge
            variant={order.payment_status === "Paid" ? "success" : "warning"}
            label={order.payment_status}
          />
        </View>

        <View className="gap-space-3">
          {/*
            Rating is offered only once the order is actually delivered — the
            screen behind it refuses anything else, so showing it earlier would
            be a button that exists to be rejected.
          */}
          {order.order_status === "Delivered" ? (
            <Button
              label={
                order.rider_rating
                  ? "You rated this delivery"
                  : "Rate your delivery"
              }
              variant={order.rider_rating ? "outline" : "default"}
              onPress={() => router.push(`/order/${order._id}/rate`)}
            />
          ) : (
            <Button
              label="Track this order"
              onPress={() => router.push(`/order/${order._id}/track`)}
            />
          )}
          <Button
            variant="outline"
            label="Keep shopping"
            onPress={() => router.replace("/")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
    </View>
  );
}

function OrderSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[28px] w-3/5 rounded-sm" />
      </View>
      <View className="px-screen gap-space-4">
        <Skeleton className="h-[76px] w-full rounded-lg" />
        <Skeleton className="h-[15px] w-2/5 rounded-sm" />
        <Skeleton className="h-[15px] w-full rounded-sm" />
        <Skeleton className="h-[15px] w-4/5 rounded-sm" />
      </View>
    </SafeAreaView>
  );
}
