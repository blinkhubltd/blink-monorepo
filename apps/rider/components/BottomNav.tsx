import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "@repo/mobile-ui/components/ui/icon";
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
 * The bottom nav, per the rider design: a rounded pill behind each glyph, ink
 * when the tab is active, gold glyphs throughout, ink labels.
 *
 * ── Two deliberate departures, both taken from the shop's tab bar ─────────
 *
 * The design leaves inactive glyphs as bare gold on the white bar. That is
 * about 1.7:1 — well under the 3:1 a non-text control needs — and apps/shop's
 * tab bar hit the same problem and fixed it by drawing an ink-100 pill behind
 * every inactive glyph in light mode. This does the same, so the two apps'
 * navs agree; in dark mode the gold already reads on the bar and the inactive
 * pill goes away, again matching the shop.
 *
 * The design's own mock draws that pill with only a slight corner radius —
 * `rounded-md`, 12px, on a 48×38 box reads as a rounded rectangle, not the
 * pill the design calls it. Shop's tab pill is fully rounded (a 42px square at
 * `borderRadius: 24`, i.e. a circle); `rounded-pill` here is the same idea
 * carried onto this design's wider box — a stadium, not a square with clipped
 * corners.
 *
 * Custom rather than the default tab bar because the queue tab's icon and label
 * change with the role — the reference app solved that by shipping two whole
 * parallel tab groups.
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const role = useCrewRole();

  const items: {
    name: string;
    label: string;
    icon: IconName;
    active: IconName;
  }[] = [
    { name: "index", label: "Home", icon: "home-outline", active: "home" },
    {
      name: "deliveries",
      label: queueTabLabel(role),
      icon: role === "rider" ? "bicycle-outline" : "basket-outline",
      active: role === "rider" ? "bicycle" : "basket",
    },
    {
      name: "incentives",
      label: "Incentives",
      icon: "trending-up-outline",
      active: "trending-up",
    },
    {
      name: "profile",
      label: "Profile",
      icon: "person-outline",
      active: "person",
    },
  ];

  return (
    <View
      className="flex-row border-t border-border bg-card px-space-3 pt-space-3 shadow-nav"
      style={{ paddingBottom: Math.max(insets.bottom, 14) }}
    >
      {items.map((item) => {
        const index = state.routes.findIndex(
          (r: { name: string }) => r.name === item.name,
        );
        const focused = state.index === index;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            onPress={() => navigation.navigate(item.name)}
            className="flex-1 items-center gap-[5px] py-space-1"
          >
            <View
              className={cn(
                "h-[38px] w-[48px] items-center justify-center rounded-pill",
                focused
                  ? "bg-on-brand-pill dark:bg-ink-700"
                  : "bg-secondary dark:bg-transparent",
              )}
            >
              <Icon
                name={focused ? item.active : item.icon}
                size={22}
                tone="brand"
              />
            </View>
            <Text
              size="caption"
              weight={focused ? "bold" : "medium"}
              className="text-strong"
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
