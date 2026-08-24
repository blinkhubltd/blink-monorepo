import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Bell, ChevronRight, MapPin } from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Avatar } from "@repo/mobile-ui/components/ui/avatar";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { Stat } from "../../components/Stat";
import { useCrew, useCrewRole } from "../../providers/CrewProvider";
import { formatClock, greeting, initials } from "../../lib/format";
import {
  FIXTURE_ACTIVE_WORK,
  FIXTURE_BOOST,
  FIXTURE_HOME_SUMMARY,
  FIXTURE_QUEUE,
} from "../../lib/data/fixtures";
import { progressPct } from "../../lib/incentives";

export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = useCrewRole();
  const { crew, online, setOnline } = useCrew();
  const [refreshing, setRefreshing] = useState(false);

  const summary = FIXTURE_HOME_SUMMARY[role];
  const active = FIXTURE_ACTIVE_WORK[role];
  const upNext = FIXTURE_QUEUE[role][1];

  /**
   * Real refresh. The reference app attached a control that resolved a
   * setTimeout, so the spinner appeared to do work while nothing was refetched.
   * When the Convex queries land this awaits them; until then it resolves
   * immediately rather than pretending to take time.
   */
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
        className="gap-space-6 pb-space-7"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text variant="muted" size="sm" weight="medium">
              {greeting(new Date())}
            </Text>
            <Text variant="heading" size="h2">
              {crew?.name ?? "—"}
            </Text>
          </View>
          <View className="flex-row items-center gap-space-3">
            <IconButton
              accessibilityLabel="Notifications"
              onPress={() => router.push("/notifications")}
            >
              <Bell size={22} strokeWidth={2} className="text-strong" />
            </IconButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => router.push("/(tabs)/profile")}
              className="active:opacity-70"
            >
              <Avatar
                uri={crew?.avatarUrl}
                fallback={initials(crew?.name)}
                className="bg-ink-950"
              />
            </Pressable>
          </View>
        </View>

        <Card className="flex-row items-center justify-between">
          <View>
            <Text weight="bold" className="text-strong">
              {online
                ? role === "rider"
                  ? "You’re online"
                  : "On shift"
                : "You’re offline"}
            </Text>
            <Text variant="muted" size="sm">
              {crew?.hubName}
              {online && crew?.onShiftSince
                ? ` · since ${formatClock(crew.onShiftSince)}`
                : ""}
            </Text>
          </View>
          <Switch
            checked={online}
            onCheckedChange={setOnline}
            aria-label={online ? "Go offline" : "Go online"}
          />
        </Card>

        <View className="flex-row gap-space-4">
          <Card className="flex-1">
            <Stat {...summary.primary} />
          </Card>
          <Card className="flex-1">
            <Stat {...summary.secondary} />
          </Card>
        </View>

        {active ? (
          <View className="gap-space-3">
            <Text variant="heading" size="h4">
              {role === "rider" ? "Active delivery" : "Active order"}
            </Text>
            <Card className="gap-space-4">
              <View className="flex-row items-center justify-between">
                <Text weight="bold" size="sm" className="text-strong">
                  Order #{active.reference}
                </Text>
                <Badge
                  variant={
                    active.badgeTone === "success" ? "success" : "secondary"
                  }
                  label={active.badgeLabel}
                />
              </View>

              {active.addressLine ? (
                <View className="flex-row items-center gap-space-3">
                  <MapPin size={16} strokeWidth={2} className="text-subtle" />
                  <Text size="sm" className="flex-1">
                    {active.addressLine}
                  </Text>
                </View>
              ) : null}

              {active.progress ? (
                <View className="gap-space-2">
                  <ProgressBar
                    pct={progressPct(
                      active.progress.done,
                      active.progress.total,
                    )}
                  />
                  <Text variant="muted" size="label" weight="medium">
                    {active.progress.done} of {active.progress.total} items
                    picked
                  </Text>
                </View>
              ) : null}

              <Button
                full
                label={role === "rider" ? "View delivery" : "Continue picking"}
                icon={
                  <ArrowRight
                    size={18}
                    strokeWidth={2}
                    className="text-primary-foreground"
                  />
                }
                onPress={() =>
                  router.push(
                    role === "rider"
                      ? `/delivery/${active.targetId}`
                      : `/picklist/${active.targetId}`,
                  )
                }
              />
            </Card>
          </View>
        ) : null}

        {role === "picker" && upNext ? (
          <View className="gap-space-3">
            <Text variant="heading" size="h4">
              Up next
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/picklist/${upNext.id}`)}
              className="active:opacity-70"
            >
              <Card className="flex-row items-center justify-between">
                <View>
                  <Text weight="semibold" size="sm" className="text-strong">
                    Order #{upNext.reference}
                  </Text>
                  <Text variant="muted" size="sm">
                    {upNext.subtitle} · {upNext.status}
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  strokeWidth={2}
                  className="text-subtle"
                />
              </Card>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/incentives")}
          className="active:opacity-90"
        >
          {/* Ink card — the DS inverse surface. */}
          <Card className="gap-space-3 border-ink-950 bg-ink-950">
            <View className="flex-row items-center justify-between">
              <Text weight="bold" size="sm" variant="onInverse">
                {FIXTURE_BOOST.title}
              </Text>
              <Badge variant="warning" label={FIXTURE_BOOST.bonusLabel} />
            </View>
            <Text size="sm" className="text-ink-300">
              {FIXTURE_BOOST.description}
            </Text>
            <ProgressBar
              onInverse
              pct={progressPct(FIXTURE_BOOST.done, FIXTURE_BOOST.target)}
            />
            <Text size="label" weight="medium" className="text-ink-400">
              {FIXTURE_BOOST.done} of {FIXTURE_BOOST.target} deliveries
            </Text>
          </Card>
        </Pressable>
      </View>
    </Screen>
  );
}
