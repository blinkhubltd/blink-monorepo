import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlinkRiderMark } from "@repo/mobile-ui/components/ui/blink-rider-mark";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { Screen } from "../../components/Screen";
import { PickerHome } from "../../components/home/PickerHome";
import { RiderHome } from "../../components/home/RiderHome";
import { useCrew, useCrewRole } from "../../providers/CrewProvider";
import { greeting } from "../../lib/format";
import { useUnreadCount } from "../../lib/data";

/**
 * Home: a shared greeting header, then the role's own content.
 *
 * The rider design is what riders see — duty card, promise badge, stat
 * cards, the active delivery. Pickers keep their picking home; the design has
 * no picker screens, so nothing of theirs is removed to make room.
 *
 * The header drops the profile avatar the old home carried: the design puts
 * only notifications up here, and Profile is one tab away.
 */
export default function HomeRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = useCrewRole();
  const { crew } = useCrew();
  const unread = useUnreadCount();

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-[14px] pb-space-7"
      >
        <View className="flex-row items-center justify-between gap-space-4">
          <View className="flex-1 flex-row items-center gap-space-4">
            {/* Mode-fixed ink, so the gold mark reads the same day and night. */}
            <View className="size-[44px] items-center justify-center rounded-md bg-on-brand-pill">
              <BlinkRiderMark height={18} />
            </View>
            <View className="flex-1">
              <Text size="label" variant="subtle">
                {greeting(new Date())}
              </Text>
              <Text
                weight="bold"
                numberOfLines={1}
                className="text-[20px] leading-[26px] tracking-h2 text-strong"
              >
                {crew?.name ?? "—"}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread && unread > 0
                ? `Notifications, ${unread} unread`
                : "Notifications"
            }
            onPress={() => router.push("/notifications")}
            className="relative size-[42px] items-center justify-center rounded-pill border border-border bg-card active:opacity-80"
          >
            <Icon name="notifications-outline" size={19} tone="strong" />
            {unread !== undefined && unread > 0 ? (
              <View
                pointerEvents="none"
                className="absolute right-[9px] top-[8px] size-[8px] rounded-pill border-2 border-card bg-destructive"
              />
            ) : null}
          </Pressable>
        </View>

        {role === "rider" ? <RiderHome /> : <PickerHome />}
      </View>
    </Screen>
  );
}
