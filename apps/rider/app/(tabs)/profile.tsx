import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { Avatar } from "@repo/mobile-ui/components/ui/avatar";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useCrew } from "../../providers/CrewProvider";
import { useRiderStats } from "../../lib/data";
import { initials } from "../../lib/format";
import { roleLabel } from "../../lib/roles";

/**
 * Profile, per the design: who you are, three numbers, where to change
 * things, and the way out.
 *
 * Two departures, both for want of data. The third stat is "Completed", not
 * the design's "On time": the backend's on-time rate is a copy of the
 * completion rate, and labelling it on-time would claim a punctuality nobody
 * measured. And there is no "Help & safety" row, because there is nothing yet
 * for it to open.
 */
export default function ProfileRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { crew, loading, signOut } = useCrew();
  const { colorScheme, setColorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const isRider = crew?.role === "rider";

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-[14px] pb-space-7"
      >
        <Text
          weight="bold"
          className="text-[24px] leading-[30px] tracking-h2 text-strong"
        >
          Profile
        </Text>

        {/*
          A real loading state. The reference app rendered the identity block
          unconditionally, so before the user document arrived it showed an empty
          avatar next to blank text.
        */}
        <View className="flex-row items-center gap-[14px] rounded-lg border border-border bg-card p-space-5">
          {loading || !crew ? (
            <>
              <Skeleton className="size-[60px] rounded-pill" />
              <View className="gap-space-2">
                <Skeleton className="h-space-6 w-[140px]" />
                <Skeleton className="h-space-4 w-[180px]" />
              </View>
            </>
          ) : (
            <>
              {crew.avatarUrl ? (
                <Avatar
                  size="lg"
                  uri={crew.avatarUrl}
                  fallback={initials(crew.name)}
                  className="size-[60px]"
                />
              ) : (
                // Drawn here rather than via Avatar's fallback, whose ink text
                // would vanish on the design's ink circle.
                <View className="size-[60px] items-center justify-center rounded-pill bg-on-brand-pill">
                  <Text weight="bold" className="text-[20px] leading-[26px] text-primary">
                    {initials(crew.name)}
                  </Text>
                </View>
              )}
              <View className="flex-1">
                <Text size="h4" weight="bold" numberOfLines={1} className="text-strong">
                  {crew.name}
                </Text>
                <Text size="sm" variant="subtle" numberOfLines={2}>
                  {roleLabel(crew.role)} · {crew.hubName}
                </Text>
              </View>
            </>
          )}
        </View>

        {isRider ? <RiderStats /> : null}

        <View className="overflow-hidden rounded-lg border border-border bg-card">
          <ListRow
            label="Personal details"
            icon={<Icon name="person-outline" size={19} tone="foreground" />}
            onPress={() => router.push("/personal-details")}
          />
          {isRider ? (
            // Read-only: vehicle details are set by the hub at onboarding and
            // there is no screen for a rider to change them.
            <ListRow
              label="Vehicle & kit"
              icon={<Icon name="bicycle-outline" size={19} tone="foreground" />}
              value={crew?.vehicle || "Not set"}
            />
          ) : null}
          <ListRow
            label="Shifts"
            icon={<Icon name="time-outline" size={19} tone="foreground" />}
            onPress={() => router.push("/shifts")}
          />
          <ListRow
            label="Payout details"
            icon={<Icon name="card-outline" size={19} tone="foreground" />}
            onPress={() => router.push("/payout-details")}
          />
          <ListRow
            label="Dark mode"
            divider={false}
            icon={<Icon name="moon-outline" size={19} tone="foreground" />}
            right={
              <Switch
                checked={dark}
                onCheckedChange={(next) =>
                  setColorScheme(next ? "dark" : "light")
                }
                aria-label="Dark mode"
              />
            }
          />
        </View>

        <View className="overflow-hidden rounded-lg border border-border bg-card">
          <ListRow
            label="Sign out"
            destructive
            divider={false}
            icon={<Icon name="log-out-outline" size={19} tone="destructive" />}
            onPress={() => {
              // Clerk clears the session and the secure-store token cache; the
              // gate at "/" then routes to sign-in. Replacing the route without
              // signing out would leave the session live and bounce straight
              // back in.
              void signOut().then(() => router.replace("/"));
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

function RiderStats() {
  const stats = useRiderStats();
  const tiles = [
    {
      label: "Rating",
      value: stats ? (stats.rating !== null ? stats.rating.toFixed(1) : "—") : null,
    },
    {
      label: "Deliveries",
      value: stats ? stats.completedTotal.toLocaleString("en-KE") : null,
    },
    {
      label: "Completed",
      value: stats ? `${Math.round(stats.completionRate)}%` : null,
    },
  ];

  return (
    <View className="flex-row gap-space-4">
      {tiles.map((t) => (
        <View
          key={t.label}
          className="flex-1 items-center rounded-lg border border-border bg-card p-space-4"
        >
          {t.value === null ? (
            <Skeleton className="h-[26px] w-[48px]" />
          ) : (
            <Text weight="bold" className="text-[20px] leading-[26px] text-strong">
              {t.value}
            </Text>
          )}
          <Text size="caption" variant="subtle">
            {t.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
