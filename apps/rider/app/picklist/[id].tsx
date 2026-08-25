import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { LinearTransition } from "react-native-reanimated";
import { PackageCheck } from "lucide-react-native";
import type { Id } from "@repo/backend/dataModel";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { BarcodeField } from "../../components/pick/BarcodeField";
import { PickProgress } from "../../components/pick/PickProgress";
import { PickRow } from "../../components/pick/PickRow";
import { usePickActions, usePickList } from "../../lib/data";
import type { PickItem } from "../../lib/data/types";

/**
 * Groups items by shelf location, outstanding locations first.
 *
 * A pick list is a walking route. Insertion order means crossing the shop and
 * back; grouping by location means each aisle is visited once, and pushing
 * finished groups down keeps what is left at the top of the screen.
 */
function groupByLocation(items: PickItem[]) {
  const groups = new Map<string, PickItem[]>();
  for (const item of items) {
    const list = groups.get(item.location);
    if (list) list.push(item);
    else groups.set(item.location, [item]);
  }

  return [...groups.entries()]
    .map(([location, groupItems]) => ({
      location,
      items: groupItems,
      complete: groupItems.every((i) => i.picked),
      // Prescription items are held back: they cannot be picked from this list
      // and need a separate check, so they should not sit between two aisles.
      hasPrescription: groupItems.some((i) => i.requiresPrescription),
    }))
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      if (a.hasPrescription !== b.hasPrescription) {
        return a.hasPrescription ? 1 : -1;
      }
      return a.location.localeCompare(b.location);
    });
}

export default function PickListRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = (id ?? null) as Id<"orders"> | null;

  const model = usePickList(orderId);
  const actions = usePickActions(orderId);

  const [busyItem, setBusyItem] = useState<Id<"order_items"> | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the list is what puts the order into Processing, so the hub sees
  // "being picked" as soon as it is true.
  const status = model?.status;
  useEffect(() => {
    if (status === "Pending" || status === "Confirmed") {
      void actions.start().catch(() => {
        // Non-fatal: the picker can still pick, the status just lags.
      });
    }
  }, [status, actions]);

  const onPick = useCallback(
    async (itemId: Id<"order_items">, delta: 1 | -1) => {
      setBusyItem(itemId);
      setError(null);
      try {
        await actions.pickUnit(itemId, delta);
      } catch {
        setError("Could not save that. Check your connection and try again.");
      } finally {
        setBusyItem(null);
      }
    },
    [actions],
  );

  const onScan = useCallback(
    async (barcode: string) => {
      try {
        const result = await actions.scanBarcode(barcode);
        return { ok: result?.success === true };
      } catch (err) {
        // scanItem raises ConvexError for the cases a picker can act on, so they
        // are surfaced as such rather than as a generic failure.
        const raw = err instanceof Error ? err.message : "";
        const message = /not in the current order/i.test(raw)
          ? "That product isn’t on this order"
          : /exceeded/i.test(raw)
            ? "All units of that item are already picked"
            : /not found/i.test(raw)
              ? "No product matches that code"
              : "Could not record that scan";
        return { ok: false, message };
      }
    },
    [actions],
  );

  async function onComplete() {
    setCompleting(true);
    setError(null);
    try {
      await actions.complete();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
            <Skeleton className="h-space-9 w-[160px]" />
            <Skeleton className="h-space-3 rounded-pill" />
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-[88px]" />
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
              one belonging to another vendor, so this covers both without
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

  const groups = groupByLocation(model.items);
  const unitsLeft = model.unitsTotal - model.unitsPicked;
  const outstanding = model.items.filter((i) => !i.picked);
  const blockedByPrescription =
    outstanding.length > 0 && outstanding.every((i) => i.requiresPrescription);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={`#${model.reference}`} />

      {/* Pinned, so progress stays visible while the list scrolls. */}
      <PickProgress
        unitsPicked={model.unitsPicked}
        unitsTotal={model.unitsTotal}
        itemsPicked={model.itemsPicked}
        itemsTotal={model.items.length}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-screen gap-space-6"
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: insets.bottom + 140,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BarcodeField onScan={onScan} disabled={completing} />

        {groups.map((group) => (
          <Animated.View
            key={group.location}
            layout={LinearTransition.duration(240)}
            className="gap-space-3"
          >
            <View className="flex-row items-center justify-between">
              <Text variant="eyebrow" size="label">
                {group.location}
              </Text>
              <Text
                variant={group.complete ? "success" : "subtle"}
                size="caption"
                weight="semibold"
              >
                {group.items.filter((i) => i.picked).length}/
                {group.items.length}
              </Text>
            </View>

            <View className="gap-space-3">
              {group.items.map((item) => (
                <Animated.View
                  key={item.id}
                  layout={LinearTransition.duration(240)}
                >
                  <PickRow
                    item={item}
                    busy={busyItem === item.id}
                    onPick={(delta) => void onPick(item.id, delta)}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ))}

        {error ? (
          <Text variant="destructive" size="sm">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {/*
        Pinned action: a picker finishing the last item should not have to scroll
        to the end of a long list to find it.
      */}
      <View
        className="border-t-hairline border-border bg-card px-screen pt-space-4 shadow-nav"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Button
          full
          size="lg"
          label="Complete pick"
          loading={completing}
          disabled={!model.complete}
          icon={
            <PackageCheck
              size={18}
              strokeWidth={2}
              className="text-primary-foreground"
            />
          }
          onPress={() => void onComplete()}
        />
        {!model.complete ? (
          <Text
            variant="muted"
            size="caption"
            className="pt-space-2 text-center"
          >
            {blockedByPrescription
              ? "Verify the prescription item to finish this order."
              : `${unitsLeft} more ${unitsLeft === 1 ? "unit" : "units"} to pick.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
