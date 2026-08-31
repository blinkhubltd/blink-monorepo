import { useState } from "react";
import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { ShoppingBag, Tag } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";

import { ScreenHeader } from "../../components/screen-header";
import {
  ClearanceCard,
  ClearanceCardSkeleton,
} from "../../components/clearance-card";
import {
  CoverageEmptyState,
  NeedsLocationState,
} from "../../components/states";
import { useLocation } from "../../providers/LocationProvider";
import { formatKES } from "../../lib/format";

/**
 * Clearance deals. URL `/clearance`.
 *
 * ── A separate basket, said out loud ─────────────────────────────────────
 *
 * Clearance items live in their own table with their own stock, expiry and
 * delivery rule, and they check out through their own basket. That is a real
 * constraint of the model rather than a design choice, so the screen states it
 * instead of letting a customer discover it when their catalogue basket empties
 * of clearance items at checkout — which is what the old app's two parallel
 * baskets did silently.
 *
 * ── Coverage, and the radius that differs ────────────────────────────────
 *
 * Clearance has its own service radius setting (`clearance_service_radius`),
 * separate from a vendor's own. A deal can therefore be visible where a
 * catalogue product from the same shop is not. The empty state distinguishes
 * "nothing delivers here" from "no deals right now" for the same reason the
 * catalogue does.
 */
export default function ClearanceScreen() {
  const { point, denied, request } = useLocation();

  const [industryId, setIndustryId] = useState<Id<"industry"> | null>(null);

  const deals = useQuery(
    api.data.clearance_products.getActiveByCoverage,
    point
      ? {
          lat: point.lat,
          lng: point.lng,
          ...(industryId ? { industry_id: industryId } : {}),
          limit: 40,
        }
      : "skip",
  );
  // `limit` is required, and the query returns `{ data, pagination }`. Twenty
  // is far more industries than the chip rail can usefully show.
  const industryPage = useQuery(api.data.industry.getActiveIndustries, {
    limit: 20,
  });
  const industries = industryPage?.data;
  const basket = useQuery(api.data.clearance_cart.getMyClearanceCart, {});
  const setLine = useMutation(api.data.clearance_cart.setMyClearanceLine);

  const [error, setError] = useState<string | null>(null);

  function quantityOf(id: string): number {
    return (
      basket?.items.find((i) => i.clearanceProductId === id)?.quantity ?? 0
    );
  }

  function change(id: Id<"clearance_products">, quantity: number) {
    setError(null);
    void setLine({ clearanceProductId: id, quantity }).catch((caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update your clearance basket.",
      ),
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Clearance"
        title="Deals near you"
        subtitle="Short-dated stock at a discount, from shops that can reach you"
        showCart={false}
      />

      {/*
        The separate basket, stated before anything is added rather than
        discovered at checkout.
      */}
      {basket && basket.itemCount > 0 ? (
        <View className="px-screen pb-space-3">
          <Pressable
            onPress={() => router.push("/clearance/cart")}
            accessibilityRole="button"
            accessibilityLabel={`Clearance basket, ${basket.itemCount} items, ${formatKES(basket.subtotal)}`}
            className="bg-inverse gap-space-3 p-space-3 flex-row items-center rounded-lg active:opacity-90"
          >
            <ShoppingBag size={18} color="#FFFFFF" />
            <Text variant="onInverse" size="sm" weight="semibold" className="flex-1">
              {basket.itemCount} clearance{" "}
              {basket.itemCount === 1 ? "item" : "items"} ·{" "}
              {formatKES(basket.subtotal)}
            </Text>
            <Text variant="onInverse" size="sm" weight="semibold">
              View
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View className="px-screen pb-space-3">
          <Pressable
            onPress={() => setError(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            className="bg-destructive-soft p-space-3 rounded-md"
          >
            <Text size="sm" variant="destructive">
              {error}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Industry filter, only when there is more than one to choose. */}
      {industries && industries.length > 1 ? (
        <View className="pb-space-3">
          <FlashList
            data={[{ _id: null, name: "All deals" }, ...industries]}
            horizontal
            keyExtractor={(item) => item._id ?? "all"}
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-screen"
            ItemSeparatorComponent={() => <View className="w-space-2" />}
            renderItem={({ item }) => {
              const active = industryId === item._id;
              return (
                <Pressable
                  onPress={() => setIndustryId(item._id as Id<"industry"> | null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`h-control-sm px-space-4 rounded-pill items-center justify-center ${
                    active ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <Text
                    size="label"
                    weight="semibold"
                    variant={active ? "onBrand" : "muted"}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {!point ? (
        <NeedsLocationState onRequest={() => void request()} denied={denied} />
      ) : deals === undefined ? (
        <View className="px-screen gap-space-4 flex-row">
          <ClearanceCardSkeleton />
          <ClearanceCardSkeleton />
        </View>
      ) : deals.products.length === 0 ? (
        // `total === 0` with no filter applied means nothing reaches this
        // address; with a filter it means nothing in that industry. Distinct
        // messages, because they call for different actions.
        industryId ? (
          <View className="gap-space-3 px-screen py-space-10 items-center">
            <Tag size={32} color="#818A99" />
            <Text size="lg" weight="semibold" className="text-center">
              No deals in this category
            </Text>
            <Button
              variant="outline"
              label="Show all deals"
              onPress={() => setIndustryId(null)}
            />
          </View>
        ) : (
          <CoverageEmptyState onChangeLocation={() => void request()} />
        )
      ) : (
        <FlashList
          data={deals.products}
          numColumns={2}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-10"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          renderItem={({ item, index }) => (
            <View
              className={
                index % 2 === 0 ? "pr-space-2 flex-1" : "pl-space-2 flex-1"
              }
            >
              <ClearanceCard
                deal={item}
                quantityInBasket={quantityOf(item._id)}
                onPress={() => router.push(`/clearance/${item._id}`)}
                onAdd={() => change(item._id, 1)}
                onIncrement={() => change(item._id, quantityOf(item._id) + 1)}
                onDecrement={() =>
                  change(item._id, Math.max(0, quantityOf(item._id) - 1))
                }
              />
            </View>
          )}
          ListFooterComponent={
            deals.truncated ? (
              // The scan behind this query is capped, so the count is a floor.
              <Text size="caption" variant="subtle" className="pt-space-4">
                Showing the newest deals near you.
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
