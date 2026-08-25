import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Linking } from "react-native";
import {
  ArrowRight,
  Bell,
  ChevronRight,
  MapPin,
  TriangleAlert,
} from "lucide-react-native";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Avatar } from "@repo/mobile-ui/components/ui/avatar";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { IconButton } from "../../components/IconButton";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { Stat } from "../../components/Stat";
import { useCrew, useCrewRole } from "../../providers/CrewProvider";
import { useLocationSharing } from "../../providers/LocationProvider";
import { greeting, initials } from "../../lib/format";
import { useHome, useUnreadCount } from "../../lib/data";
import { progressPct } from "../../lib/incentives";

function HomeSkeleton() {
  return (
    <View className="gap-space-6">
      <Card className="h-[72px]" />
      <View className="flex-row gap-space-4">
        <Card className="h-[90px] flex-1" />
        <Card className="h-[90px] flex-1" />
      </View>
      <Skeleton className="h-space-6 w-[140px]" />
      <Card className="h-[150px]" />
    </View>
  );
}

export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = useCrewRole();
  const { crew, online, setOnline } = useCrew();
  const home = useHome();
  const unread = useUnreadCount();
  const location = useLocationSharing();

  return (
    <Screen withTabBar>
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
            <View className="relative">
              <IconButton
                accessibilityLabel={
                  unread && unread > 0
                    ? `Notifications, ${unread} unread`
                    : "Notifications"
                }
                onPress={() => router.push("/notifications")}
              >
                <Bell size={22} strokeWidth={2} className="text-strong" />
              </IconButton>
              {unread !== undefined && unread > 0 ? (
                <View
                  className="absolute right-space-2 top-space-2 h-space-3 w-space-3 rounded-pill bg-destructive"
                  pointerEvents="none"
                />
              ) : null}
            </View>
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

        {/*
          Riders only. `updateRiderOnlineStatus` reads `rider_details`, which a
          picker does not have — a picker's availability is their shift, not a
          toggle, so showing one here would be a control that cannot work.
        */}
        {role === "rider" ? (
          <Card className="flex-row items-center justify-between">
            <View>
              <Text weight="bold" className="text-strong">
                {online ? "You’re online" : "You’re offline"}
              </Text>
              <Text variant="muted" size="sm">
                {crew?.hubName}
              </Text>
            </View>
            <Switch
              checked={online}
              onCheckedChange={setOnline}
              aria-label={online ? "Go offline" : "Go online"}
            />
          </Card>
        ) : null}

        {/*
          Said out loud because it fails silently otherwise. A rider who declined
          background location is online, taking work, and invisible to their hub —
          and nothing on screen would tell them until someone rang to ask where
          they were.
        */}
        {role === "rider" && location.needsPermission ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fix location permission in settings"
            onPress={() => {
              void Linking.openSettings();
            }}
            className="active:opacity-80"
          >
            <Card className="flex-row items-center gap-space-4 border-warning bg-warning-soft">
              <TriangleAlert
                size={20}
                strokeWidth={2}
                className="text-warning-foreground"
              />
              <View className="flex-1">
                <Text weight="semibold" size="sm" className="text-strong">
                  Your hub can’t see your location
                </Text>
                <Text variant="muted" size="caption">
                  {location.state === "background_denied"
                    ? "Set location to “Allow all the time” so deliveries keep tracking while the app is closed."
                    : "Turn on location access to receive and track deliveries."}
                </Text>
              </View>
              <ChevronRight
                size={18}
                strokeWidth={2}
                className="text-warning-foreground"
              />
            </Card>
          </Pressable>
        ) : null}

        {home === undefined ? (
          <HomeSkeleton />
        ) : (
          <>
            <View className="flex-row gap-space-4">
              <Card className="flex-1">
                <Stat {...home.summary.primary} />
              </Card>
              <Card className="flex-1">
                <Stat {...home.summary.secondary} />
              </Card>
            </View>

            {home.active ? (
              <View className="gap-space-3">
                <Text variant="heading" size="h4">
                  {role === "rider" ? "Active delivery" : "Active order"}
                </Text>
                <Card className="gap-space-4">
                  <View className="flex-row items-center justify-between">
                    <Text weight="bold" size="sm" className="text-strong">
                      Order #{home.active.reference}
                    </Text>
                    <Badge
                      variant={
                        home.active.badgeTone === "success"
                          ? "success"
                          : "secondary"
                      }
                      label={home.active.badgeLabel}
                    />
                  </View>

                  {home.active.addressLine ? (
                    <View className="flex-row items-center gap-space-3">
                      <MapPin
                        size={16}
                        strokeWidth={2}
                        className="text-subtle"
                      />
                      <Text size="sm" className="flex-1">
                        {home.active.addressLine}
                      </Text>
                    </View>
                  ) : null}

                  {home.active.progress ? (
                    <View className="gap-space-2">
                      <ProgressBar
                        pct={progressPct(
                          home.active.progress.done,
                          home.active.progress.total,
                        )}
                      />
                      <Text variant="muted" size="label" weight="medium">
                        {home.active.progress.done} of{" "}
                        {home.active.progress.total} items picked
                      </Text>
                    </View>
                  ) : null}

                  <Button
                    full
                    label={
                      role === "rider" ? "View delivery" : "Continue picking"
                    }
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
                          ? `/delivery/${home.active!.targetId}`
                          : `/picklist/${home.active!.targetId}`,
                      )
                    }
                  />
                </Card>
              </View>
            ) : (
              <Card className="items-center gap-space-2 py-space-8">
                <Text weight="semibold" className="text-strong">
                  {role === "rider" ? "No active delivery" : "Nothing to pick"}
                </Text>
                <Text variant="muted" size="sm" className="text-center">
                  {role === "rider"
                    ? "You’ll be notified as soon as your hub assigns one."
                    : "Orders queued for picking will appear here."}
                </Text>
              </Card>
            )}

            {home.upNext ? (
              <View className="gap-space-3">
                <Text variant="heading" size="h4">
                  Up next
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/picklist/${home.upNext!.id}`)}
                  className="active:opacity-70"
                >
                  <Card className="flex-row items-center justify-between">
                    <View>
                      <Text weight="semibold" size="sm" className="text-strong">
                        Order #{home.upNext.reference}
                      </Text>
                      <Text variant="muted" size="sm">
                        {home.upNext.subtitle} · {home.upNext.status}
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
          </>
        )}

        {/*
          The design's "Weekend boost" card is not rendered.

          There is no campaign concept in the backend at all — no table, no
          query, nothing that defines a bonus target or tracks progress towards
          one. `incentives` has a per-day threshold and a per-extra-delivery
          rate, which is a different thing. A hardcoded "Ksh 300 bonus" card is a
          promise the app cannot keep, so the Incentives tab shows the real
          numbers instead and this card waits for a real campaign source.
        */}
      </View>
    </Screen>
  );
}
