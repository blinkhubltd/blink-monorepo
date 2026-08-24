import React from "react";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBarManager } from "@/components/ui/status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";

export default function PickerTabLayout() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const tabBarHeight = Platform.select({
    ios: 49 + insets.bottom,
    android: 56 + (insets.bottom || 0),
    default: 56,
  });

  const paddingBottom = Platform.select({
    ios: insets.bottom > 0 ? insets.bottom : 6,
    android: insets.bottom > 0 ? insets.bottom + 4 : 8,
    default: 8,
  });

  return (
    <>
      <StatusBarManager
        style={theme.colors.background === "#121212" ? "light" : "dark"}
        backgroundColor={theme.colors.background}
        translucent={false}
      />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.inactive,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: tabBarHeight,
            paddingBottom: paddingBottom,
            paddingTop: 6,
            paddingHorizontal: 8,
            elevation: 4,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
            marginBottom: 0,
            marginTop: 2,
            letterSpacing: 0.2,
          },
          tabBarIconStyle: {
            marginTop: 0,
          },
          headerStyle: {
            backgroundColor: theme.colors.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: 1,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: "800",
            fontSize: 20,
            color: theme.colors.text,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerTitle: "Picker Dashboard",
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Orders",
            headerTitle: "Picking Orders",
            tabBarIcon: ({ color }) => (
              <Ionicons name="cube-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="prescriptions"
          options={{
            title: "Prescriptions",
            headerTitle: "Prescription Verification",
            tabBarIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="incentives"
          options={{
            title: "Incentives",
            headerTitle: "My Incentives",
            tabBarIcon: ({ color }) => (
              <Ionicons name="trophy-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerTitle: "My Profile",
            tabBarIcon: ({ color }) => (
              <Ionicons name="person-outline" size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
