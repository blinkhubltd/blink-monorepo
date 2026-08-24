import { useMemo } from "react";
import { View } from "react-native";
import { BellOff, Bike, CalendarClock, CreditCard, TrendingUp } from "lucide-react-native";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { formatClock } from "../lib/format";
import { fixtureNotifications } from "../lib/data/fixtures";
import type { CrewNotification, CrewNotificationKind } from "../lib/data/types";

const KIND_ICON: Record<CrewNotificationKind, typeof Bike> = {
  assignment: Bike,
  incentive: TrendingUp,
  shift: CalendarClock,
  payout: CreditCard,
};

/** Assignments and incentives are brand-tinted; the rest are neutral. */
const KIND_TINT: Record<CrewNotificationKind, string> = {
  assignment: "text-blink-600",
  incentive: "text-blink-600",
  shift: "text-subtle",
  payout: "text-subtle",
};

interface Group {
  label: string;
  items: CrewNotification[];
}

/**
 * Splits into Today / Earlier against a supplied `now`, so the boundary is a
 * real local midnight rather than "less than 24 hours ago".
 */
function groupByDay(items: CrewNotification[], now: number): Group[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const boundary = startOfToday.getTime();

  const today = items.filter((n) => n.createdAt >= boundary);
  const earlier = items.filter((n) => n.createdAt < boundary);

  return [
    { label: "Today", items: today },
    { label: "Earlier", items: earlier },
  ].filter((g) => g.items.length > 0);
}

export default function NotificationsRoute() {
  const now = Date.now();
  const groups = useMemo(
    () => groupByDay(fixtureNotifications(now), now),
    [now],
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Notifications" />
      <Screen scroll={groups.length > 0}>
        {groups.length === 0 ? (
          <EmptyState
            icon={<BellOff size={32} strokeWidth={2} className="text-subtle" />}
            title="Nothing new"
            body="Assignments, incentives and payout updates will show up here."
          />
        ) : (
          <View className="gap-space-6 pb-space-7">
            {groups.map((group) => (
              <View key={group.label} className="gap-space-3">
                <Text variant="eyebrow" size="label">
                  {group.label}
                </Text>
                <View className="gap-space-3">
                  {group.items.map((item) => {
                    const Icon = KIND_ICON[item.kind];
                    return (
                      <Card
                        key={item.id}
                        className="flex-row items-center gap-space-4 py-space-4"
                      >
                        <Icon
                          size={18}
                          strokeWidth={2}
                          className={KIND_TINT[item.kind]}
                        />
                        <View className="flex-1">
                          <Text
                            weight={item.read ? "medium" : "semibold"}
                            size="sm"
                            className="text-strong"
                          >
                            {item.title}
                          </Text>
                          <Text variant="muted" size="label">
                            {group.label === "Today"
                              ? formatClock(item.createdAt)
                              : "Yesterday"}
                          </Text>
                        </View>
                        {!item.read ? (
                          <View className="h-space-2 w-space-2 rounded-pill bg-primary" />
                        ) : null}
                      </Card>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </Screen>
    </View>
  );
}
