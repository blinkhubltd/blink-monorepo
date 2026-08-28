import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { ChevronRight } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../components/screen-header";
import { formatKES } from "../../lib/format";
import { isLive, presentStatus } from "../../lib/order-status";

/**
 * Order history.
 *
 * ── Grouped by basket ────────────────────────────────────────────────────
 *
 * A basket spanning several shops becomes several orders sharing one payment
 * reference. Listed flat, that reads as three separate purchases the customer
 * does not remember making. Grouped, it reads as what actually happened.
 *
 * Live orders come first regardless of date, because someone opening this screen
 * is almost always asking "where is my delivery" rather than browsing history.
 */
export default function OrdersScreen() {
  const { isSignedIn } = useAuth();
  const orders = useQuery(
    api.data.orders.getMyOrders,
    isSignedIn ? {} : "skip",
  );

  if (!isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your orders" showCart={false} />
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
        <ScreenHeader title="Your orders" showCart={false} />
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

  // Group by the basket they came from. Orders with no reference stand alone.
  const groups = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.paymentReference ?? order._id;
    const existing = groups.get(key);
    if (existing) existing.push(order);
    else groups.set(key, [order]);
  }

  const baskets = [...groups.entries()]
    .map(([key, group]) => ({
      key,
      orders: group,
      // A basket is live while ANY of its deliveries still is.
      live: group.some((o) => isLive(o.orderStatus)),
      date: Math.max(...group.map((o) => o.orderDate)),
      total: group.reduce((sum, o) => sum + o.total, 0),
    }))
    .sort((a, b) => {
      // Live first, then newest. Someone opening this screen usually wants the
      // delivery that has not arrived, not the one from last month.
      if (a.live !== b.live) return a.live ? -1 : 1;
      return b.date - a.date;
    });

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Your orders" showCart={false} />

      <FlashList
        data={baskets}
        keyExtractor={(item) => item.key}
        contentContainerClassName="px-screen pb-space-8"
        ItemSeparatorComponent={() => <View className="h-space-4" />}
        renderItem={({ item }) => (
          <View className="border-hairline border-border bg-card gap-space-3 p-space-4 rounded-lg">
            <View className="gap-space-2 flex-row items-baseline justify-between">
              <Text size="caption" variant="subtle">
                {new Date(item.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
              <Text size="sm" weight="semibold">
                {formatKES(item.total)}
              </Text>
            </View>

            {item.orders.length > 1 ? (
              <Text size="caption" variant="eyebrow">
                {item.orders.length} deliveries
              </Text>
            ) : null}

            {item.orders.map((order, index) => {
              const status = presentStatus(order.orderStatus);
              return (
                <View key={order._id} className="gap-space-2">
                  {index > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={() => router.push(`/order/${order._id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${order.vendorName ?? "Order"}, ${status.label}`}
                    className="gap-space-3 flex-row items-center active:opacity-70"
                  >
                    <View className="gap-space-1 flex-1">
                      <Text size="sm" weight="medium" numberOfLines={1}>
                        {order.vendorName ?? "Order"}
                      </Text>
                      <Text size="caption" variant="subtle" numberOfLines={1}>
                        {order.previewNames.join(", ")}
                        {order.itemCount > order.previewNames.length
                          ? ` +${order.itemCount - order.previewNames.length} more`
                          : ""}
                      </Text>
                      <Badge variant={status.variant} label={status.label} />
                    </View>
                    <ChevronRight size={18} color="#818A99" />
                  </Pressable>
                </View>
              );
            })}

            {/* Only offered while there is something to track. */}
            {item.live ? (
              <Button
                variant="outline"
                size="sm"
                label="Track"
                onPress={() =>
                  router.push(`/order/${item.orders[0]!._id}/track`)
                }
              />
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function OrdersSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader title="Your orders" showCart={false} />
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
