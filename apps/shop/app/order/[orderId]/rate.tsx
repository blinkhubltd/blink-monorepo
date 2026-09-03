import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Star } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";

import { ScreenHeader } from "../../../components/screen-header";
import { NotFoundState } from "../../../components/states";

/**
 * Rate a delivery.
 *
 * ── The backend this replaces was open in both directions ────────────────
 *
 * `submitRiderRating` was public and unauthenticated, checking only that the
 * order was Delivered and unrated — so anyone with an order id could set a
 * rider's score, and a rider's score is their standing and their work.
 * `getRiderRatingContext` returned the rider's full name and phone number to
 * the same anonymous caller. Both are internal now; this screen uses the
 * owner-scoped pair, which returns a first name and no number.
 *
 * ── One rating, and it says so before you tap ────────────────────────────
 *
 * A second rating is refused rather than overwriting the first. The screen shows
 * the score already given instead of offering stars that will be rejected — the
 * old screen let you tap five stars and then told you `already_rated`.
 */
export default function RateDeliveryScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const context = useQuery(
    api.data.ratings.getMyDeliveryRating,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip",
  );
  const rate = useMutation(api.data.ratings.rateMyDelivery);

  const [chosen, setChosen] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (context === undefined) {
    return (
      <SafeAreaView edges={["top"]} className="bg-background flex-1">
        <ScreenHeader title="Rate your delivery" showCart={false} />
        <View className="px-screen gap-space-3">
          <Skeleton className="h-[18px] w-2/3 rounded-sm" />
          <Skeleton className="h-[44px] w-full rounded-md" />
        </View>
      </SafeAreaView>
    );
  }

  if (context === null) {
    // Same response as an order that does not exist, so this screen cannot be
    // used to discover which order ids are real.
    return (
      <NotFoundState what="order" onBack={() => router.replace("/orders")} />
    );
  }

  const alreadyRated = context.myRating !== null;
  const rider = context.riderFirstName;

  async function submit() {
    if (!chosen) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await rate({
        orderId: orderId as Id<"orders">,
        rating: chosen,
      });
      if (result.success) {
        setDone(true);
      } else {
        setError(
          result.error === "already_rated"
            ? "This delivery has already been rated."
            : "There is no rider on this order to rate.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send your rating.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        eyebrow={`Order ${context.reference.slice(-6).toUpperCase()}`}
        title="Rate your delivery"
        showCart={false}
      />

      <View className="px-screen gap-space-5">
        {done || alreadyRated ? (
          <View className="gap-space-3 items-center">
            <Stars value={context.myRating ?? chosen ?? 0} readOnly />
            <Text size="base" weight="semibold" className="text-center">
              {done ? "Thank you" : "You rated this delivery"}
            </Text>
            <Text size="sm" variant="muted" className="text-center">
              Ratings are final, so riders can rely on them.
            </Text>
            <Button
              label="Back to orders"
              onPress={() => router.replace("/orders")}
            />
          </View>
        ) : !context.canRate ? (
          <View className="gap-space-3">
            <Text size="base" weight="semibold">
              Not ready to rate yet
            </Text>
            <Text size="sm" variant="muted">
              {context.orderStatus === "Delivered"
                ? "No rider is recorded against this delivery."
                : `This order is ${context.orderStatus.toLowerCase()}. You can rate it once it has been delivered.`}
            </Text>
            <Button
              variant="outline"
              label="Track this order"
              onPress={() => router.replace(`/order/${orderId}/track`)}
            />
          </View>
        ) : (
          <>
            <Text size="sm" variant="muted">
              {rider
                ? `How did ${rider} do?`
                : "How did your delivery go?"}
            </Text>

            <Stars value={chosen ?? 0} onChange={setChosen} />

            {error ? (
              <View className="bg-destructive-soft p-space-3 rounded-md">
                <Text size="sm" variant="destructive">
                  {error}
                </Text>
              </View>
            ) : null}

            <Button
              size="lg"
              full
              label="Send rating"
              loading={submitting}
              disabled={!chosen || submitting}
              onPress={() => void submit()}
            />
            <Text size="caption" variant="subtle" className="text-center">
              You can only rate a delivery once.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Stars({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
}) {
  return (
    <View className="gap-space-2 flex-row justify-center">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Pressable
            key={star}
            disabled={readOnly}
            onPress={() => onChange?.(star)}
            accessibilityRole={readOnly ? "image" : "button"}
            accessibilityState={{ selected: filled }}
            accessibilityLabel={`${star} ${star === 1 ? "star" : "stars"}`}
            hitSlop={6}
            className="size-control-lg items-center justify-center active:opacity-70"
          >
            <Star
              size={34}
              color={filled ? "#FFC50B" : "#818A99"}
              fill={filled ? "#FFC50B" : "transparent"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
