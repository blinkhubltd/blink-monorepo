import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { useCart } from "../providers/CartProvider";
import { BasketLineRow } from "../components/basket-line";
import { ScreenHeader } from "../components/screen-header";
import { formatKES } from "../lib/format";
import type { Id } from "@repo/backend/dataModel";

/**
 * The basket.
 *
 * ── Where the money comes from ───────────────────────────────────────────
 *
 * `cart.getMyTotals` — one server-side calculation over one settings read, the
 * same `lib/delivery_fee.ts` an order will be priced with. The screen this
 * replaces summed prices client-side and showed a single "Total" with **no
 * delivery fee at all**, while a dead `getCartSummary` quoted 250/free-over-2000
 * and checkout charged a flat 200. Three numbers, no agreement, and the
 * customer shown none of them.
 *
 * Guests get the client-side subtotal instead, because `getMyTotals` is
 * auth-derived and a guest has no server basket. The delivery line then says so
 * rather than inventing a figure.
 *
 * ── Real pagination ──────────────────────────────────────────────────────
 *
 * The old screen imported `FlashList`, `CartItem`, `loadMore`, `hasMore`,
 * `handleEndReached` and `renderFooter` — and used **none** of them, rendering a
 * hand-inlined `.map()` in a `ScrollView`. So a basket larger than one page
 * showed only the first page AND totalled only the visible page: the customer
 * saw an understated figure. Lines come from the provider here, so there is one
 * list and one total over the same data.
 */
export default function CartScreen() {
  const { isSignedIn } = useAuth();
  const cart = useCart();

  // Auth-derived, so it is skipped for guests rather than returning a
  // misleading zero.
  const totals = useQuery(api.data.cart.getMyTotals, isSignedIn ? {} : "skip");

  const unavailable = cart.items.filter((i) => !i.isPurchasable).length;
  const canCheckout = cart.items.some((i) => i.isPurchasable);

  if (cart.items.length === 0 && !cart.loading) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Your basket" showCart={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Text size="lg" weight="semibold">
            Your basket is empty
          </Text>
          <Text variant="muted" size="sm" className="text-center">
            {cart.isGuest
              ? "Add something and it will be here when you sign in."
              : "Browse the shop and add what you need."}
          </Text>
          <Button label="Start shopping" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title="Your basket"
        subtitle={`${cart.count} ${cart.count === 1 ? "item" : "items"}`}
        showCart={false}
      />

      {cart.writeError ? (
        <View className="mx-screen mb-space-3 bg-destructive-soft p-space-4 rounded-md">
          <Text size="sm" variant="destructive">
            {cart.writeError}
          </Text>
        </View>
      ) : null}

      {cart.accountMissing ? (
        <View className="mx-screen mb-space-3 bg-warning-soft p-space-4 rounded-md">
          <Text size="sm">
            Your account is still being set up. Your basket is safe — try again
            in a moment.
          </Text>
        </View>
      ) : null}

      <FlashList
        data={cart.items}
        keyExtractor={(item) => item.product}
        ItemSeparatorComponent={() => <Separator />}
        contentContainerClassName="pb-space-8"
        renderItem={({ item }) => (
          <BasketLineRow
            line={{ ...item, product: item.product as string }}
            onIncrement={() => cart.increment(item.product as Id<"products">)}
            onDecrement={() => cart.decrement(item.product as Id<"products">)}
            onRemove={() => cart.remove(item.product as Id<"products">)}
          />
        )}
        ListFooterComponent={
          <View className="px-screen pt-space-6 gap-space-3">
            {unavailable > 0 ? (
              <Text size="caption" variant="subtle">
                {unavailable} {unavailable === 1 ? "item is" : "items are"} no
                longer available and {unavailable === 1 ? "has" : "have"} been
                left out of the total.
              </Text>
            ) : null}

            <Separator />

            <Row label="Subtotal" value={formatKES(cart.subtotal)} />

            {cart.isGuest ? (
              <Row
                label="Delivery"
                value="Calculated at checkout"
                muted
                hint="Sign in to see your delivery fee."
              />
            ) : totals === undefined ? (
              <Skeleton className="h-[20px] w-full rounded-sm" />
            ) : (
              <>
                <Row
                  label="Delivery"
                  value={
                    totals.freeDeliveryApplied && totals.deliveryFee === 0
                      ? "Free"
                      : formatKES(totals.deliveryFee)
                  }
                  hint={
                    totals.vendorCount > 1
                      ? `${totals.vendorCount} shops, so one delivery fee plus a pickup charge for each extra shop.`
                      : undefined
                  }
                />
                {/*
                  Only shown when it is actionable. Telling someone who already
                  qualifies how much more to spend is noise.
                */}
                {!totals.freeDeliveryApplied &&
                totals.freeDeliveryThreshold > 0 ? (
                  <Text size="caption" variant="subtle">
                    Spend{" "}
                    {formatKES(
                      Math.max(
                        0,
                        totals.freeDeliveryThreshold - totals.subtotal,
                      ),
                    )}{" "}
                    more for free delivery.
                  </Text>
                ) : null}
              </>
            )}

            <Separator />

            <View className="gap-space-2 flex-row items-baseline justify-between">
              <Text size="base" weight="semibold">
                Total
              </Text>
              <Text variant="price" size="priceLg">
                {formatKES(
                  cart.isGuest
                    ? cart.subtotal
                    : (totals?.total ?? cart.subtotal),
                )}
              </Text>
            </View>

            <Button
              label={cart.isGuest ? "Sign in to check out" : "Check out"}
              size="lg"
              full
              disabled={!canCheckout}
              onPress={() => router.push("/checkout")}
              className="mt-space-3"
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  muted = false,
  hint,
}: {
  label: string;
  value: string;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <View className="gap-space-1">
      <View className="gap-space-3 flex-row items-baseline justify-between">
        <Text size="sm" variant="muted">
          {label}
        </Text>
        <Text
          size="sm"
          weight={muted ? "regular" : "medium"}
          variant={muted ? "subtle" : "default"}
        >
          {value}
        </Text>
      </View>
      {hint ? (
        <Text size="caption" variant="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
