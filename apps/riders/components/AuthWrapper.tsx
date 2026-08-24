import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter, useSegments } from "expo-router";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { THEME } from "@/theme/design";

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Debug logging
  console.log("🔐 AuthWrapper Debug:", {
    userLoaded,
    authLoaded,
    isSignedIn,
    userId: user?.id,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userName: user?.fullName,
    segments,
    currentPath: segments.join("/"),
  });

  useEffect(() => {
    if (!authLoaded || !userLoaded) {
      console.log("⏳ AuthWrapper: Waiting for auth/user to load...");
      return;
    }

    const inAuthFlow =
      segments[0] === "sign-in" || segments[0] === "verify-code";

    console.log("🚦 AuthWrapper Navigation Logic:", {
      isSignedIn,
      inAuthFlow,
      currentSegment: segments[0],
      willRedirect: (isSignedIn && inAuthFlow) || (!isSignedIn && !inAuthFlow),
    });

    if (isSignedIn && !inAuthFlow) {
      // User is signed in and not on auth pages, allow access to protected routes
      console.log(
        "✅ AuthWrapper: User signed in, allowing access to protected route",
      );
      return;
    } else if (isSignedIn && inAuthFlow) {
      // User is signed in but on auth pages, redirect to index for role-based routing
      console.log(
        "🟡 AuthWrapper: Redirecting signed-in user from auth pages to index",
      );
      router.replace("/");
    } else if (!isSignedIn && !inAuthFlow) {
      // User is not signed in and not on auth pages, redirect to sign-in
      console.log("🔴 AuthWrapper: Redirecting unsigned user to /sign-in");
      router.replace("/sign-in");
    } else {
      console.log(
        "🔵 AuthWrapper: User not signed in, allowing access to auth pages",
      );
    }
    // If not signed in and on auth pages (inAuthFlow), allow access
  }, [authLoaded, userLoaded, isSignedIn, segments, router]);

  // Show loading screen while authentication state is being determined
  if (!authLoaded || !userLoaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: THEME.colors.background }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 24,
              backgroundColor: THEME.colors.primary,
              alignItems: "center",
              justifyContent: "center",
              ...THEME.shadow.card,
            }}
          >
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: "#fff",
                letterSpacing: -0.5,
              }}
            >
              B
            </Text>
          </View>
          <ActivityIndicator size="small" color={THEME.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}
