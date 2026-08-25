import { useMemo, useState } from "react";
import { View } from "react-native";
import { CalendarOff } from "lucide-react-native";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { useShifts, useToggleShift } from "../lib/data";
import type { WeekdayName } from "../lib/data/shifts";

export default function ShiftsRoute() {
  // Captured once per mount rather than per render, so the "Today / Tomorrow"
  // labels do not shift underneath a toggle mid-interaction.
  const now = useMemo(() => Date.now(), []);
  const model = useShifts(now);
  const toggleShift = useToggleShift();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(weekday: WeekdayName, enabled: boolean) {
    if (!model?.template) return;
    setBusy(weekday);
    setError(null);
    try {
      await toggleShift(model.template, weekday, enabled);
    } catch {
      setError("Could not update your shift. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Shifts" />
      <Screen scroll={model === undefined || model.rows.length > 0}>
        {model === undefined ? (
          <View className="gap-space-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-[72px]" />
            ))}
          </View>
        ) : model.rows.length === 0 ? (
          <EmptyState
            icon={
              <CalendarOff size={32} strokeWidth={2} className="text-subtle" />
            }
            title="No shifts scheduled"
            body="Your hub sets your weekly schedule. Contact your hub lead to be added to a rota."
          />
        ) : (
          <View className="gap-space-4 pb-space-7">
            {model.rows.map((row) => (
              <Card
                key={row.id}
                className={
                  busy === row.id
                    ? "flex-row items-center justify-between opacity-60"
                    : "flex-row items-center justify-between"
                }
              >
                <View className="flex-1 pr-space-4">
                  <Text weight="semibold" size="sm" className="text-strong">
                    {row.dayLabel}
                  </Text>
                  <Text variant="muted" size="sm">
                    {row.timeLabel} · {row.hubName}
                  </Text>
                </View>
                <Switch
                  checked={row.enabled}
                  disabled={busy !== null}
                  onCheckedChange={(next) => void onToggle(row.weekday, next)}
                  aria-label={`${row.dayLabel} shift`}
                />
              </Card>
            ))}

            {error ? (
              <Text variant="destructive" size="sm">
                {error}
              </Text>
            ) : null}

            {/*
              Said plainly because the data model forces it: a schedule is a
              recurring weekly template, so turning off "Thursday" turns off
              every Thursday, not just this one. Presenting these as dated rows
              without saying so would let a rider think they had declined a
              single shift.
            */}
            <Text variant="muted" size="caption">
              Shifts repeat weekly. Changing a day changes it every week — ask
              your hub lead for a one-off change.
            </Text>
          </View>
        )}
      </Screen>
    </View>
  );
}
