import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Minus, Plus, Tag, Trash2 } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { OptimizedImage } from "@repo/mobile-ui/components/ui/optimized-image";

import { ScreenHeader } from "../../components/screen-header";
import { formatKES } from "../../lib/format";
import { describeExpiry, describeSaving } from "../../lib/clearance";

/**
 * The clearance basket. URL `/clearance/cart`.
 *
 * ── Separate from the catalogue basket, and separately priced ─────────────
 *
 * Clearance items have their own table, their own stock, their own expiry and
 * their own delivery rule — the free-delivery threshold does not apply, because
 * they are already discounted and waiving delivery on top erodes the margin
 * twice. That is why they cannot simply join the main basket, and the screen says
 * so rather than leaving a customer to wonder why their totals do not combine.
 *
 * ── A guest basket is not offered here ───────────────────────────────────
 *
 * The catalogue basket lives on the device while signed out and merges on sign
 * in. Clearance stock is finite and short-dated, so a basket held on a device for
 * days is a basket of things that have since sold or expired — the merge would be
 * mostly disappointment. Sign-in comes first, and the screen says why.
 */
export default function ClearanceCartScreen() {
  const { isLoaded, isSignedIn } = useAuth();

  const basket = useQuery(api.data.clearance_cart.getMyClearanceCart, {});
  const quoteResult = useQuery(
    api.data.clearance_checkout.quoteMyClearanceBasket,
    isSignedIn ? {} : "skip",
  );
  const setLine = useMutation(api.data.clearance_cart.setMyClearanceLine);
  const clearBasket = useMutation(api.data.clearance_cart.clearMyClearanceCart);

  const [error, setError] = useState<string | null>(null);

  if (isLoaded && !isSignedIn) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader eyebrow="Clearance" title="Your deals" showCart={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Tag size={36} color="#818A99" />
          <Text size="lg" weight="semibold" className="text-center">
            Sign in to reserve deals
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Clearance stock is limited and short-dated, so it is held against
            your account rather than this device.
          </Text>
          <Button
            label="Sign in"
            onPress={() => router.push("/(auth)/sign-in")}
          />
        </View>
      </SafeAreaView>
    );
  }

  function change(id: Id<"clearance_products">, quantity: number) {
    setError(null);
    void setLine({ clearanceProductId: id, quantity }).catch((caught) =>
      setError(
        caught instanceof Error ? caught.message : "Could not update that line.",
      ),
    );
  }

  if (basket === undefined) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader eyebrow="Clearance" title="Your deals" showCart={false} />
        <View className="px-screen gap-space-3">
          {Array.from({ length: 3 }, (_, i) => (
            <View key={i} className="gap-space-3 flex-row items-center">
              <Skeleton className="size-[64px] rounded-md" />
              <View className="gap-space-2 flex-1">
                <Skeleton className="h-[14px] w-2/3 rounded-sm" />
                <Skeleton className="h-[12px] w-1/3 rounded-sm" />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (basket.items.length === 0) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader eyebrow="Clearance" title="Your deals" showCart={false} />
        <View className="gap-space-4 px-screen py-space-10 items-center">
          <Tag size={36} color="#818A99" />
          <Text size="lg" weight="semibold">
            No deals yet
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            Clearance items are kept separate from your normal basket, with their
            own delivery charge.
          </Text>
          <Button
            label="Browse deals"
            onPress={() => router.replace("/clearance")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const quote = quoteResult?.quote ?? null;
  const sellable = basket.items.filter((i) => i.sellable);

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow="Clearance"
        title="Your deals"
        subtitle={`${basket.itemCount} ${basket.itemCount === 1 ? "item" : "items"}`}
        showCart={false}
      />

      <ScrollView contentContainerClassName="px-screen gap-space-4 pb-space-10">
        {error ? (
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
        ) : null}

        {basket.items.map((item) => {
          const saving = describeSaving(item.originalPrice, item.clearancePrice);
          const expiry = describeExpiry(item.expiryDate, item.displayEndDate);

          return (
            <View
              key={item.clearanceProductId}
              className={`border-hairline gap-space-3 p-space-3 flex-row rounded-lg ${
                item.sellable ? "border-border bg-card" : "border-transparent bg-muted"
              }`}
            >
              <View className="bg-muted size-[64px] overflow-hidden rounded-md">
                {item.imageUrl ? (
                  <OptimizedImage
                    source={{ uri: item.imageUrl }}
                    contentFit="contain"
                    className={`h-full w-full rounded-none ${
                      item.sellable ? "" : "opacity-50"
                    }`}
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
              </View>

              <View className="gap-space-1 flex-1">
                <Text size="sm" weight="medium" numberOfLines={2}>
                  {item.name}
                </Text>

                {/*
                  Unsellable lines stay, with the reason. The old basket dropped
                  them from its totals while still rendering them, so the sum
                  and the list disagreed.
                */}
                {item.sellable ? (
                  <Text
                    size="caption"
                    variant={expiry.urgent ? "destructive" : "subtle"}
                  >
                    {expiry.label}
                  </Text>
                ) : (
                  <Badge
                    variant="secondary"
                    label={item.unavailableReason ?? "Unavailable"}
                  />
                )}

                <View className="gap-space-2 flex-row items-baseline">
                  <Text variant="price" size="price">
                    {formatKES(item.clearancePrice)}
                  </Text>
                  {saving ? (
                    <Text size="caption" variant="subtle" className="line-through">
                      {formatKES(item.originalPrice)}
                    </Text>
                  ) : null}
                </View>

                {item.sellable ? (
                  <View className="gap-space-2 pt-space-1 flex-row items-center">
                    <View className="h-control-sm gap-space-1 rounded-pill bg-muted px-space-1 flex-row items-center">
                      <Pressable
                        onPress={() =>
                          change(
                            item.clearanceProductId,
                            Math.max(0, item.quantity - 1),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Fewer ${item.name}`}
                        hitSlop={6}
                        className="rounded-pill size-[26px] items-center justify-center active:opacity-70"
                      >
                        <Minus size={14} color="#0A0E16" />
                      </Pressable>
                      <Text
                        size="label"
                        weight="semibold"
                        className="min-w-[16px] text-center"
                      >
                        {item.quantity}
                      </Text>
                      <Pressable
                        onPress={() =>
                          change(item.clearanceProductId, item.quantity + 1)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`More ${item.name}`}
                        hitSlop={6}
                        // Capped at the listing's remaining stock.
                        disabled={item.quantity >= item.available}
                        className="rounded-pill size-[26px] items-center justify-center active:opacity-70 disabled:opacity-40"
                      >
                        <Plus size={14} color="#0A0E16" />
                      </Pressable>
                    </View>
                    <View className="flex-1" />
                    <Text size="sm" weight="semibold">
                      {formatKES(item.lineTotal)}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => change(item.clearanceProductId, 0)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    hitSlop={8}
                    className="gap-space-1 pt-space-1 flex-row items-center active:opacity-70"
                  >
                    <Trash2 size={14} color="#818A99" />
                    <Text size="caption" variant="subtle">
                      Remove
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        <Separator />

        {/* The server's figures, not the screen's arithmetic. */}
        {quote ? (
          <View className="gap-space-2">
            <Row label="Items" value={formatKES(quote.subtotal)} />
            <Row label="Delivery" value={formatKES(quote.deliveryFee)} />
            {quote.vendorCount > 1 ? (
              <Text size="caption" variant="subtle">
                {quote.vendorCount} shops, so delivery covers each pickup.
              </Text>
            ) : null}
            <Text size="caption" variant="subtle">
              Clearance delivery is charged separately from your normal basket,
              and free delivery does not apply to discounted stock.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            setError(null);
            void clearBasket({}).catch(() =>
              setError("Could not empty your clearance basket."),
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Empty clearance basket"
          className="min-h-control items-center justify-center active:opacity-70"
        >
          <Text size="sm" variant="subtle">
            Empty this basket
          </Text>
        </Pressable>
      </ScrollView>

      <View className="border-hairline border-border bg-card px-screen py-space-4 gap-space-2">
        <View className="flex-row items-baseline justify-between">
          <Text size="sm" variant="muted">
            Total
          </Text>
          <Text variant="price" size="priceLg">
            {quote ? formatKES(quote.total) : formatKES(basket.subtotal)}
          </Text>
        </View>
        <Button
          size="lg"
          full
          disabled={sellable.length === 0 || !quote}
          label="Checkout deals"
          onPress={() => router.push("/clearance/checkout")}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </View>
  );
}
