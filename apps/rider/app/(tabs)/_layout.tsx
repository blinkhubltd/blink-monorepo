import { Tabs } from "expo-router";
import { BottomNav } from "../../components/BottomNav";

/**
 * One tab group for both roles. The queue tab renames itself (Deliveries /
 * Orders) and each screen branches on the role for its content.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="deliveries" />
      <Tabs.Screen name="incentives" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
