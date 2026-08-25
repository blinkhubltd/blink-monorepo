import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarClock,
  CreditCard,
  LogOut,
  Moon,
  User,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Avatar } from "@repo/mobile-ui/components/ui/avatar";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Skeleton } from "@repo/mobile-ui/components/ui/skeleton";
import { Switch } from "@repo/mobile-ui/components/ui/switch";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { ListRow } from "../../components/ListRow";
import { Screen } from "../../components/Screen";
import { useCrew } from "../../providers/CrewProvider";
import { initials } from "../../lib/format";
import { roleLabel } from "../../lib/roles";

export default function ProfileRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { crew, loading, signOut } = useCrew();
  const { colorScheme, setColorScheme } = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <Screen withTabBar>
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="gap-space-5 pb-space-7"
      >
        <Text variant="heading" size="h3">
          Profile
        </Text>

        {/*
          A real loading state. The reference app rendered the identity block
          unconditionally, so before the user document arrived it showed an empty
          avatar next to blank text.
        */}
        {loading || !crew ? (
          <View className="flex-row items-center gap-space-4">
            <Skeleton className="h-[56px] w-[56px] rounded-pill" />
            <View className="gap-space-2">
              <Skeleton className="h-space-6 w-[140px]" />
              <Skeleton className="h-space-4 w-[180px]" />
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-space-4">
            <Avatar
              size="lg"
              uri={crew.avatarUrl}
              fallback={initials(crew.name)}
              className="h-[56px] w-[56px] bg-ink-950"
            />
            <View>
              <Text weight="bold" size="h4" className="text-strong">
                {crew.name}
              </Text>
              <Text variant="muted" size="sm">
                {roleLabel(crew.role)} · {crew.hubName}
              </Text>
            </View>
          </View>
        )}

        <Card className="gap-0 p-0">
          <ListRow
            label="Personal details"
            icon={<User size={18} strokeWidth={2} className="text-subtle" />}
            onPress={() => router.push("/personal-details")}
          />
          <ListRow
            label="Shifts"
            icon={
              <CalendarClock size={18} strokeWidth={2} className="text-subtle" />
            }
            onPress={() => router.push("/shifts")}
          />
          <ListRow
            label="Payout details"
            icon={
              <CreditCard size={18} strokeWidth={2} className="text-subtle" />
            }
            onPress={() => router.push("/payout-details")}
          />
          <ListRow
            label="Dark mode"
            divider={false}
            icon={<Moon size={18} strokeWidth={2} className="text-subtle" />}
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
        </Card>

        <Card className="gap-0 p-0">
          <ListRow
            label="Sign out"
            destructive
            divider={false}
            icon={
              <LogOut size={18} strokeWidth={2} className="text-destructive" />
            }
            onPress={() => {
              // Clerk clears the session and the secure-store token cache; the
              // gate at "/" then routes to sign-in. Replacing the route without
              // signing out would leave the session live and bounce straight
              // back in.
              void signOut().then(() => router.replace("/"));
            }}
          />
        </Card>

      </View>
    </Screen>
  );
}
