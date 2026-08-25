import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Id } from "@repo/backend/dataModel";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Checkbox } from "@repo/mobile-ui/components/ui/checkbox";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { usePickActions, usePickList } from "../../lib/data";
import { PrescriptionItemLink } from "../../components/PrescriptionItemLink";
import { progressPct } from "../../lib/incentives";

export default function PickListRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = (id ?? null) as Id<"orders"> | null;

  const model = usePickList(orderId);
  const actions = usePickActions(orderId);
  const [busyItem, setBusyItem] = useState<Id<"order_items"> | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the list is what puts the order into Processing. Doing it here
  // rather than behind a button means the hub sees "being picked" as soon as it
  // is true, which is what the queue's status chip reports.
  const status = model?.status;
  useEffect(() => {
    if (status === "Pending" || status === "Confirmed") {
      void actions.start().catch(() => {
        // Non-fatal: the picker can still pick. The status just lags.
      });
    }
  }, [status, actions]);

  async function toggle(itemId: Id<"order_items">, next: boolean) {
    setBusyItem(itemId);
    setError(null);
    try {
      await actions.togglePicked(itemId, next);
    } catch {
      setError("Could not save that. Check your connection and try again.");
    } finally {
      setBusyItem(null);
    }
  }

  async function onComplete() {
    setCompleting(true);
    setError(null);
    try {
      await actions.complete();
      router.replace("/(tabs)/deliveries");
    } catch {
      setError("Could not mark the order ready. Try again.");
    } finally {
      setCompleting(false);
    }
  }

  if (model === undefined) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Pick list" />
        <Screen>
          <View className="gap-space-4">
            <Skeleton className="h-space-3 rounded-pill" />
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-[64px]" />
            ))}
          </View>
        </Screen>
      </View>
    );
  }

  if (model === null) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Pick list" />
        <Screen>
          <Card className="items-center gap-space-3 py-space-8">
            <Text weight="semibold" className="text-strong">
              Order not available
            </Text>
            {/*
              getPickerOrderDetails returns null both for a missing order and for
              one belonging to a different vendor, so this covers both without
              claiming to know which.
            */}
            <Text variant="muted" size="sm" className="text-center">
              It may have been reassigned, or it belongs to another hub.
            </Text>
          </Card>
        </Screen>
      </View>
    );
  }

  const doneCount = model.items.filter((i) => i.picked).length;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={`Pick list · #${model.reference}`} />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <ProgressBar pct={progressPct(doneCount, model.items.length)} />
          <Text variant="muted" size="label" weight="medium">
            {doneCount} of {model.items.length} items picked
          </Text>

          {model.items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole={
                item.requiresPrescription ? "button" : "checkbox"
              }
              accessibilityState={
                item.requiresPrescription
                  ? { disabled: busyItem === item.id }
                  : { checked: item.picked, disabled: busyItem === item.id }
              }
              accessibilityLabel={`${item.name}, ${item.location}, quantity ${item.quantity}`}
              disabled={busyItem === item.id}
              onPress={() => {
                // A prescription item is handled by PrescriptionItemLink, which
                // resolves the item's own document. Tapping the row body does
                // nothing for those, so the target is unambiguous.
                if (item.requiresPrescription) return;
                void toggle(item.id, !item.picked);
              }}
              className="active:opacity-70"
            >
              <Card
                className={
                  busyItem === item.id
                    ? "flex-row items-center gap-space-4 opacity-60"
                    : "flex-row items-center gap-space-4"
                }
              >
                <Checkbox
                  checked={item.picked}
                  disabled={busyItem === item.id || item.requiresPrescription}
                  onCheckedChange={(next) => {
                    // A prescription item cannot be ticked directly; it goes
                    // through review, reached via PrescriptionItemLink.
                    if (item.requiresPrescription) return;
                    void toggle(item.id, next);
                  }}
                  aria-labelledby={`pick-${item.id}`}
                />
                <View className="flex-1">
                  <Text
                    nativeID={`pick-${item.id}`}
                    weight="semibold"
                    size="sm"
                    className={
                      item.picked
                        ? "text-muted-foreground line-through"
                        : "text-strong"
                    }
                  >
                    {item.name}
                  </Text>
                  <Text variant="muted" size="sm">
                    {item.location} · Qty {item.quantity}
                  </Text>
                </View>
                {item.requiresPrescription ? (
                  <PrescriptionItemLink itemId={item.id} />
                ) : null}
              </Card>
            </Pressable>
          ))}

          {error ? (
            <Text variant="destructive" size="sm">
              {error}
            </Text>
          ) : null}

          <Button
            full
            size="lg"
            label="Complete pick"
            loading={completing}
            // Enabled only once every item is accounted for; the reference app
            // allowed completing a partially picked order.
            disabled={!model.complete}
            onPress={() => void onComplete()}
          />
          {!model.complete ? (
            <Text variant="muted" size="caption" className="text-center">
              Pick every item to complete this order.
            </Text>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}
