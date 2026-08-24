import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { House, Bike, ShoppingBasket, TrendingUp, User } from "lucide-react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import { useCrewRole } from "../providers/CrewProvider";
import { queueTabLabel } from "../lib/roles";

/**
 * Derived from expo-router's own Tabs rather than imported from
 * @react-navigation/bottom-tabs. expo-router 57 vendors its own copy of those
 * types, and the two are structurally incompatible (their HeaderOptions differ
 * on tintColor: ColorValue vs string), so taking the type from the component we
 * actually pass this to is both correct and one fewer dependency.
 */
type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/**
 * The DS bottom nav: 72px tall, upward shadow, active item marked by an ink
 * circle behind the glyph.
 *
 * Custom rather than the default tab bar because the queue tab's icon and label
 * change with the role — the reference app solved that by shipping two whole
 * parallel tab groups.
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const role = useCrewRole();

  const items = [
    { name: "index", label: "Home", Icon: House },
    {
      name: "deliveries",
      label: queueTabLabel(role),
      Icon: role === "rider" ? Bike : ShoppingBasket,
    },
    { name: "incentives", label: "Incentives", Icon: TrendingUp },
    { name: "profile", label: "Profile", Icon: User },
  ] as const;

  return (
    <View
      className="flex-row border-t-hairline border-border bg-card shadow-nav"
      style={{ paddingBottom: insets.bottom, height: 72 + insets.bottom }}
    >
      {items.map((item) => {
        const index = state.routes.findIndex(
          (r: { name: string }) => r.name === item.name,
        );
        const focused = state.index === index;
        const { Icon } = item;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            onPress={() => navigation.navigate(item.name)}
            className="flex-1 items-center justify-center gap-space-1 pt-space-3"
          >
            <View
              className={cn(
                "h-space-8 w-space-8 items-center justify-center rounded-pill",
                focused && "bg-inverse",
              )}
            >
              <Icon
                size={20}
                strokeWidth={2}
                className={focused ? "text-inverse-foreground" : "text-subtle"}
              />
            </View>
            <Text
              size="caption"
              weight={focused ? "semibold" : "regular"}
              variant={focused ? "default" : "subtle"}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
