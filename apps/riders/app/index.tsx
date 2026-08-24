import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useUser } from "@clerk/clerk-expo";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Text } from "@/components/ui/text";
import { isRider, isPicker } from "@/lib/roles";
import { THEME } from "@/theme/design";

export default function Index() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const hasNavigated = useRef(false);

  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );

  useEffect(() => {
    if (!isLoaded || hasNavigated.current) return;

    if (!isSignedIn) {
      hasNavigated.current = true;
      router.replace("/sign-in");
      return;
    }

    if (convexUser === undefined) return;

    hasNavigated.current = true;
    if (isPicker(convexUser?.roleName)) {
      router.replace("/(picker-tabs)");
    } else if (isRider(convexUser?.roleName)) {
      router.replace("/(tabs)");
    } else {
      router.replace("/unauthorized");
    }
  }, [isLoaded, isSignedIn, convexUser]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: THEME.colors.background,
        gap: 20,
      }}
    >
      {/* Logo mark */}
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          backgroundColor: THEME.colors.primary,
          alignItems: "center",
          justifyContent: "center",
          ...THEME.shadow.card,
        }}
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight: "800",
            color: "#fff",
            letterSpacing: -1,
          }}
        >
          B
        </Text>
      </View>

      <View style={{ alignItems: "center", gap: 8 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: THEME.colors.text,
            letterSpacing: -0.5,
          }}
        >
          blink
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: THEME.colors.textSecondary,
            fontWeight: "500",
            letterSpacing: 0.3,
          }}
        >
          rider & picker
        </Text>
      </View>

      <ActivityIndicator
        size="small"
        color={THEME.colors.primary}
        style={{ marginTop: 16 }}
      />
    </View>
  );
}
