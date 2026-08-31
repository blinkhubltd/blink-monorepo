import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Minus, Plus } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";
import { Pressable } from "react-native";

import { ScreenHeader } from "../../components/screen-header";
import { NotFoundState } from "../../components/states";
import { formatKES } from "../../lib/format";
import {
  clearanceUnavailableReason,
  describeExpiry,
  describeSaving,
} from "../../lib/clearance";

/**
 * One clearance deal. URL `/clearance/[dealId]`.
 *
 * ── The discount is real, so it is shown ─────────────────────────────────
 *
 * The catalogue detail screen shows no strike-through because
 * `getProductDetails` returns `hasDiscount: false` with `originalPrice` equal to
 * `price` — printing it would show the same number twice, as a claim. A clearance
 * listing carries both prices for real, and the saving here is computed from
 * them rather than read from the stored `discount_percentage`, which is written
 * separately and can disagree with the prices beside it.
 *
 * ── Two dates, kept apart ────────────────────────────────────────────────
 *
 * `expiry_date` is when the food goes off; `display_end_date` is when the offer
 * stops. Both are shown, labelled, because conflating them tells someone their
 * yoghurt keeps for a fortnight when it turns tomorrow.
 */
export default function ClearanceDealScreen() {
  const { dealId } = useLocalSearchParams<{ dealId: string }>();

  const deal = useQuery(
    api.data.clearance_products.getById,
    dealId ? { id: dealId as Id<"clearance_products"> } : "skip",
  );
  const basket = useQuery(api.data.clearance_cart.getMyClearanceCart, {});
  const setLine = useMutation(api.data.clearance_cart.setMyClearanceLine);

  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (deal === undefined) return <DealSkeleton />;
  if (deal === null) {
    return (
      <NotFoundState what="deal" onBack={() => router.replace("/clearance")} />
    );
  }

  const inBasket =
    basket?.items.find((i) => i.clearanceProductId === deal._id)?.quantity ?? 0;
  const unavailable = clearanceUnavailableReason(deal);
  const saving = describeSaving(deal.original_price, deal.clearance_price);
  const expiry = describeExpiry(deal.expiry_date, deal.display_end_date);
  const max = Math.max(1, deal.quantity);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      // Absolute, not additive: `addToCart` added to whatever was there, so
      // sending the displayed quantity turned a line of 5 into 10.
      await setLine({
        clearanceProductId: deal!._id,
        quantity: inBasket + quantity,
      });
      router.push("/clearance/cart");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add that to your clearance basket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader eyebrow="Clearance" title={deal.name} showCart={false} />

      <ScrollView contentContainerClassName="pb-space-11">
        <View className="bg-muted aspect-[4/3] w-full">
          {deal.imageUrl ? (
            <OptimizedImage
              source={{ uri: deal.imageUrl }}
              contentFit="contain"
              className={`p-space-6 h-full w-full rounded-none ${
                unavailable ? "opacity-60" : ""
              }`}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Text variant="subtle" size="sm">
                No image
              </Text>
            </View>
          )}
        </View>

        <View className="gap-space-5 px-screen pt-space-5">
          <View className="gap-space-2">
            <View className="gap-space-2 flex-row flex-wrap items-center">
              {saving ? (
                <Badge variant="destructive" label={`-${saving.percent}%`} />
              ) : null}
              {unavailable ? (
                <Badge variant="secondary" label={unavailable} />
              ) : deal.quantity <= 5 ? (
                <Badge variant="warning" label={`Only ${deal.quantity} left`} />
              ) : (
                <Badge variant="success" label="Available" />
              )}
            </View>

            <View className="gap-space-2 flex-row items-baseline">
              <Text variant="price" size="priceLg">
                {formatKES(deal.clearance_price)}
              </Text>
              {saving ? (
                <Text size="sm" variant="subtle" className="line-through">
                  {formatKES(deal.original_price)}
                </Text>
              ) : null}
            </View>

            {saving ? (
              <Text size="sm" variant="muted">
                You save {formatKES(saving.amount)}
              </Text>
            ) : null}
          </View>

          <Separator />

          {/* Both dates, labelled. */}
          <View className="gap-space-2">
            <Text
              size="sm"
              weight="semibold"
              variant={expiry.urgent ? "destructive" : "default"}
            >
              {expiry.label}
            </Text>
            {deal.expiry_date ? (
              <Text size="caption" variant="subtle">
                Use by{" "}
                {new Date(deal.expiry_date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            ) : null}
            <Text size="caption" variant="subtle">
              Offer runs until{" "}
              {new Date(deal.display_end_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </Text>
            <Text size="caption" variant="subtle">
              Clearance stock is short-dated and sold as seen. Delivery is
              charged separately from your normal basket.
            </Text>
          </View>

          {deal.description ? (
            <>
              <Separator />
              <Text size="sm" variant="muted">
                {deal.description}
              </Text>
            </>
          ) : null}

          {deal.vendor ? (
            <>
              <Separator />
              <View className="gap-space-1">
                <Text size="caption" variant="eyebrow">
                  Sold by
                </Text>
                <Text size="sm" weight="medium">
                  {deal.vendor.name}
                </Text>
              </View>
            </>
          ) : null}

          {error ? (
            <View className="bg-destructive-soft p-space-3 rounded-md">
              <Text size="sm" variant="destructive">
                {error}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned action, with the price beside it so it never scrolls away. */}
      <View className="border-hairline border-border bg-card px-screen py-space-3 gap-space-3 flex-row items-center">
        {!unavailable ? (
          <View className="h-control gap-space-2 rounded-pill bg-muted px-space-2 flex-row items-center">
            <Pressable
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              accessibilityRole="button"
              accessibilityLabel="Fewer"
              hitSlop={6}
              disabled={quantity <= 1}
              className="rounded-pill size-[32px] items-center justify-center active:opacity-70 disabled:opacity-40"
            >
              <Minus size={16} color="#0A0E16" />
            </Pressable>
            <Text size="sm" weight="semibold" className="min-w-[20px] text-center">
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity((q) => Math.min(max, q + 1))}
              accessibilityRole="button"
              accessibilityLabel="More"
              hitSlop={6}
              // Cannot exceed the listing's remaining stock.
              disabled={quantity >= max}
              className="rounded-pill size-[32px] items-center justify-center active:opacity-70 disabled:opacity-40"
            >
              <Plus size={16} color="#0A0E16" />
            </Pressable>
          </View>
        ) : null}

        <View className="flex-1">
          <Button
            size="lg"
            full
            loading={busy}
            disabled={!!unavailable || busy}
            label={
              unavailable
                ? unavailable
                : `Add · ${formatKES(deal.clearance_price * quantity)}`
            }
            onPress={() => void add()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function DealSkeleton() {
  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="px-screen py-space-4 gap-space-2">
        <Skeleton className="h-[12px] w-1/5 rounded-sm" />
        <Skeleton className="h-[28px] w-2/3 rounded-sm" />
      </View>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <View className="px-screen pt-space-5 gap-space-3">
        <Skeleton className="h-[24px] w-1/3 rounded-sm" />
        <Skeleton className="h-[14px] w-1/2 rounded-sm" />
        <Skeleton className="h-[14px] w-3/4 rounded-sm" />
      </View>
    </SafeAreaView>
  );
}
