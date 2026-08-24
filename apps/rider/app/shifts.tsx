import { useState } from "react";
import { View } from "react-native";
import { CalendarOff } from "lucide-react-native";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { FIXTURE_SHIFTS } from "../lib/data/fixtures";

export default function ShiftsRoute() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FIXTURE_SHIFTS.map((s) => [s.id, s.enabled])),
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Shifts" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          {FIXTURE_SHIFTS.map((shift) => (
            <Card key={shift.id} className="flex-row items-center justify-between">
              <View className="flex-1 pr-space-4">
                <Text weight="semibold" size="sm" className="text-strong">
                  {shift.dayLabel}
                </Text>
                <Text variant="muted" size="sm">
                  {shift.timeLabel} · {shift.hubName}
                </Text>
              </View>
              <Switch
                checked={!!enabled[shift.id]}
                onCheckedChange={(next) =>
                  setEnabled((prev) => ({ ...prev, [shift.id]: next }))
                }
                aria-label={`${shift.dayLabel} shift`}
              />
            </Card>
          ))}

          <Button
            full
            variant="ghost"
            label="Request time off"
            icon={
              <CalendarOff size={18} strokeWidth={2} className="text-strong" />
            }
            onPress={() => {
              // Opens the time-off request sheet once the mutation exists.
            }}
          />
        </View>
      </Screen>
    </View>
  );
}
