import { useState } from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Icon } from "../../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../components/screen-header";
import { formatKES } from "../../lib/format";
import {
  ORDER_STAGE_FILTERS,
  STAGE_PILL,
  isLive,
  matchesStageFilter,
  orderStage,
  type OrderStageFilter,
} from "../../lib/order-status";

/**
 * Order history.
 *
 * ── One card per order ───────────────────────────────────────────────────
 *
 * Per the design: a card per delivery, filtered by the stage a customer thinks
 * in (see `orderStage`). This used to group a multi-shop basket into one card;
 * each order's own screen now says when it was one of several deliveries, which
 * is where the customer is when the question comes up.
 *
 * Live orders come first regardless of date, because someone opening this screen
 * is almost always asking "where is my delivery" rather than browsing history.
 */
export default function OrdersScreen() {
  const { isSignedIn } = useAuth();
  const [filter, setFilter] = useState<OrderStageFilter>("All");
  const orders = useQuery(
    api.data.orders.getMyOrders,
    isSignedIn ? {} : "skip",
  );

  if (!isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your orders" showBack={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Text size="lg" weight="semibold">
            Sign in to see your orders
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (orders === undefined) return <OrdersSkeleton />;

  if (orders.length === 0) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your orders" showBack={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Text size="lg" weight="semibold">
            No orders yet
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            When you place an order it will appear here, with live tracking
            while it is on the way.
          </Text>
          <Button label="Start shopping" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  // Live first, then newest: someone opening this screen is almost always
  // asking where a delivery is, not browsing last month.
  const sorted = [...orders].sort((a, b) => {
    const aLive = isLive(a.orderStatus);
    const bLive = isLive(b.orderStatus);
    if (aLive !== bLive) return aLive ? -1 : 1;
    return b.orderDate - a.orderDate;
  });
  const visible = sorted.filter((o) =>
    matchesStageFilter(o.orderStatus, filter),
  );

  return (
    <SafeAreaView edges={["top"]} className="bg-card flex-1">
      <ScreenHeader title="Your orders" showBack={false} />

      <View className="border-b-hairline border-border bg-card">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-[8px] px-screen py-[14px]"
        >
          {ORDER_STAGE_FILTERS.map((option) => (
            <FilterChip
              key={option}
              label={option}
              active={filter === option}
              onPress={() => setFilter(option)}
            />
          ))}
        </ScrollView>
      </View>

      <View className="bg-muted flex-1">
        <FlashList
          data={visible}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-8 pt-space-5"
          ItemSeparatorComponent={() => <View className="h-[12px]" />}
          ListEmptyComponent={
            <RNText className="text-muted-foreground px-space-6 py-[60px] text-center font-sans text-[15px] leading-[22px]">
              No orders with this status.
            </RNText>
          }
          renderItem={({ item }) => <OrderCard order={item} />}
        />
      </View>
    </SafeAreaView>
  );
}

type OrderRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.data.orders.getMyOrders>>
>[number];

/**
 * One order. The body opens the order; Track opens tracking, and is offered
 * only while there is something to track — on a delivered order it would lead
 * to a finished progress bar and nothing else.
 */
function OrderCard({ order }: { order: OrderRow }) {
  const stage = orderStage(order.orderStatus);
  const pill = STAGE_PILL[stage];
  const extra = order.itemCount - order.previewNames.length;

  return (
    <View className="bg-card gap-[10px] rounded-[20px] p-[16px]">
      <View className="flex-row items-start justify-between">
        <RNText className="text-muted-foreground font-sans text-[13px] leading-[19px]">
          {new Date(order.orderDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </RNText>
        <RNText className="text-foreground text-[16px] leading-[23px] font-semibold">
          {formatKES(order.total)}
        </RNText>
      </View>

      <Pressable
        onPress={() => router.push(`/order/${order._id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${order.vendorName ?? "Order"}, ${stage}. Open order`}
        className="flex-row items-center gap-[8px] active:opacity-70"
      >
        <View className="min-w-0 flex-1 gap-[2px]">
          <RNText
            className="text-foreground text-[15px] leading-[22px] font-semibold"
            numberOfLines={1}
          >
            {order.vendorName ?? "Order"}
          </RNText>
          <RNText
            className="text-muted-foreground font-sans text-[13px] leading-[19px]"
            numberOfLines={1}
          >
            {order.previewNames.join(", ")}
            {extra > 0 ? ` +${extra} more` : ""}
          </RNText>
        </View>
        <Icon name="chevron-forward" size={18} tone="body" />
      </Pressable>

      <View className="flex-row items-center justify-between">
        <View className={`${pill.bg} rounded-[999px] px-[14px] py-[6px]`}>
          <RNText
            className={`${pill.fg} text-[13px] leading-[17px] font-semibold`}
          >
            {stage}
          </RNText>
        </View>
        {isLive(order.orderStatus) ? (
          <Button
            variant="outline"
            size="ctaSm"
            label="Track"
            onPress={() => router.push(`/order/${order._id}/track`)}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A filter pill: ink when selected, outlined when not. */
function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      className={`rounded-[999px] border-[1.5px] px-[16px] py-[8px] active:opacity-80 ${
        active ? "border-inverse bg-inverse" : "border-border bg-transparent"
      }`}
    >
      <RNText
        className={`text-[13px] leading-[17px] font-semibold ${
          active ? "text-inverse-foreground" : "text-foreground"
        }`}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function OrdersSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Your orders" showBack={false} />
      <View className="px-screen gap-space-4">
        {Array.from({ length: 4 }, (_, i) => (
          <View
            key={i}
            className="border-hairline border-border gap-space-2 p-space-4 rounded-lg"
          >
            <Skeleton className="h-[11px] w-1/3 rounded-sm" />
            <Skeleton className="h-[15px] w-3/4 rounded-sm" />
            <Skeleton className="rounded-pill h-[20px] w-1/4" />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
