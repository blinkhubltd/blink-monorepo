import { Tabs } from "expo-router";
import { Search, ShoppingBasket, Store, User } from "lucide-react-native";

/**
 * The four customer tabs.
 *
 * ── No tabPress hijack ────────────────────────────────────────────────────
 *
 * blink-ecommerce's tab layout intercepted `tabPress`, called
 * `preventDefault()`, reset the browse state machine and pushed home. That made
 * tapping Home always wipe your place in the catalogue, and it was one of the
 * eight refresh-to-home causes.
 *
 * Expo Router's default behaviour for tapping the already-active tab is "pop
 * that tab's stack to its root", which is exactly the intended effect now that
 * the drill-down is a real nested Stack. So there is deliberately no `listeners`
 * prop here. If tap-to-scroll-top is wanted later, that is `useScrollToTop` in
 * the screen, not a navigation override in the layout.
 *
 * Colours are literal here rather than semantic tokens because React Navigation
 * styles the bar through plain style objects, not className — one of the few
 * places in this app where a token cannot reach. They correspond to
 * ink-950 / ink-500 / ink-200 in global.css.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0A0E16",
        tabBarInactiveTintColor: "#818A99",
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 12,
          borderTopWidth: 1,
          borderTopColor: "#E4E7EC",
          backgroundColor: "#FFFFFF",
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Rubik_500Medium" },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size }) => (
            <ShoppingBasket color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
