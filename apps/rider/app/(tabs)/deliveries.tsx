import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Inbox } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { useCrewRole } from "../../providers/CrewProvider";
import { queueTabLabel } from "../../lib/roles";
import { FIXTURE_QUEUE } from "../../lib/data/fixtures";
import type { QueueItem, QueueTone } from "../../lib/data/types";

const TONE_TO_BADGE: Record<QueueTone, "success" | "warning" | "secondary"> = {
  success: "success",
  warning: "warning",
  neutral: "secondary",
};

function QueueSkeleton() {
  return (
    <View className="gap-space-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex-row items-center justify-between">
          <View className="gap-space-2">
            <Skeleton className="h-space-5 w-[140px]" />
            <Skeleton className="h-space-4 w-[180px]" />
          </View>
          <Skeleton className="h-space-7 w-[72px] rounded-pill" />
        </Card>
      ))}
    </View>
  );
}

export default function QueueRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = useCrewRole();
  const [refreshing, setRefreshing] = useState(false);

  // Once wired, `undefined` is Convex's loading state and drives the skeleton.
  const items: QueueItem[] | undefined = FIXTURE_QUEUE[role];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.resolve();
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <Screen withTabBar onRefresh={onRefresh} refreshing={refreshing}>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-space-5 pb-space-7"
      >
        <Text variant="heading" size="h3">
          {queueTabLabel(role)}
        </Text>

        {items === undefined ? (
          <QueueSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Inbox size={32} strokeWidth={2} className="text-subtle" />}
            title={
              role === "rider" ? "No deliveries yet" : "Nothing to pick yet"
            }
            body={
              role === "rider"
                ? "Assigned deliveries will appear here as soon as your hub dispatches them."
                : "Orders queued for picking will appear here."
            }
          />
        ) : (
          <View className="gap-space-4">
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    role === "rider"
                      ? `/delivery/${item.id}`
                      : `/picklist/${item.id}`,
                  )
                }
                className="active:opacity-70"
              >
                <Card className="flex-row items-center justify-between">
                  <View className="flex-1 pr-space-4">
                    <Text weight="semibold" size="sm" className="text-strong">
                      Order #{item.reference}
                    </Text>
                    <Text variant="muted" size="sm" numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  {/*
                    Status comes from the item, not a hardcoded string. The
                    reference app rendered a fixed "In Progress" chip on every
                    row regardless of the order's actual status.
                  */}
                  <Badge
                    variant={TONE_TO_BADGE[item.tone]}
                    label={item.status}
                  />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
