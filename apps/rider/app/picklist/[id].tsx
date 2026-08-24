import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Checkbox } from "@repo/mobile-ui/components/ui/checkbox";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { ScreenHeader } from "../../components/ScreenHeader";
import { FIXTURE_PICKLIST } from "../../lib/data/fixtures";
import { progressPct } from "../../lib/incentives";

export default function PickListRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reference = id ?? FIXTURE_PICKLIST.reference;

  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FIXTURE_PICKLIST.items.map((i) => [i.id, i.picked])),
  );

  const items = FIXTURE_PICKLIST.items;
  const doneCount = useMemo(
    () => items.filter((i) => picked[i.id]).length,
    [items, picked],
  );
  const allPicked = doneCount === items.length;

  function toggle(itemId: string) {
    setPicked((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={`Pick list · #${reference}`} />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <ProgressBar pct={progressPct(doneCount, items.length)} />
          <Text variant="muted" size="label" weight="medium">
            {doneCount} of {items.length} items picked
          </Text>

          {items.map((item) => {
            const isPicked = !!picked[item.id];
            return (
              <Pressable
                key={item.id}
                accessibilityRole={
                  item.requiresPrescription ? "button" : "checkbox"
                }
                accessibilityState={
                  item.requiresPrescription ? undefined : { checked: isPicked }
                }
                accessibilityLabel={`${item.name}, ${item.location}, quantity ${item.quantity}`}
                onPress={() =>
                  item.requiresPrescription
                    ? router.push(`/prescription/${item.id}`)
                    : toggle(item.id)
                }
                className="active:opacity-70"
              >
                <Card className="flex-row items-center gap-space-4">
                  <Checkbox
                    checked={isPicked}
                    onCheckedChange={() => {
                      // A prescription item cannot be ticked directly — it has
                      // to go through the review screen first.
                      if (item.requiresPrescription) {
                        router.push(`/prescription/${item.id}`);
                        return;
                      }
                      toggle(item.id);
                    }}
                    aria-labelledby={`pick-${item.id}`}
                  />
                  <View className="flex-1">
                    <Text
                      nativeID={`pick-${item.id}`}
                      weight="semibold"
                      size="sm"
                      className={
                        isPicked ? "text-muted-foreground line-through" : "text-strong"
                      }
                    >
                      {item.name}
                    </Text>
                    <Text variant="muted" size="sm">
                      {item.location} · Qty {item.quantity}
                    </Text>
                  </View>
                  {item.requiresPrescription ? (
                    <Badge variant="warning" label="Verify ID" />
                  ) : null}
                </Card>
              </Pressable>
            );
          })}

          <Button
            full
            size="lg"
            label="Complete pick"
            // Enabled only once every item is accounted for; the reference app
            // allowed completing a partially picked order.
            disabled={!allPicked}
            onPress={() => router.replace("/(tabs)")}
          />
          {!allPicked ? (
            <Text variant="muted" size="caption" className="text-center">
              Pick every item to complete this order.
            </Text>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}
