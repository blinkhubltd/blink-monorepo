import React from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Alert } from "react-native";

/**
 * Custom hook for authentication operations
 */
export function useAuth() {
  const { signOut: clerkSignOut, isLoaded, isSignedIn } = useClerkAuth();
  const { user } = useUser();
  const router = useRouter();

  /**
   * Sign out the user and clear all sessions
   */
  const signOut = async () => {
    try {
      console.log("🚪 Starting sign out process...");

      // Sign out from Clerk
      await clerkSignOut();

      console.log("✅ Sign out successful");

      // Navigate to sign-in page
      router.replace("/sign-in");
    } catch (error) {
      console.error("❌ Sign out error:", error);
      Alert.alert("Error", "Failed to sign out. Please try again.");
    }
  };

  /**
   * Check if user has a specific role
   */
  const hasRole = (role: string): boolean => {
    // This would typically check against user metadata or custom claims
    // For now, we'll return true for all authenticated users
    return isSignedIn || false;
  };

  /**
   * Get the current user's role from Clerk metadata (fallback only).
   * Prefer using `currentUser.roleName` from DataProvider instead.
   */
  const getUserRole = (): string | null => {
    if (!user) return null;
    const role = user.publicMetadata?.role as string | undefined;
    return role || null;
  };

  /**
   * Check if the user is authenticated
   */
  const isAuthenticated = (): boolean => {
    return isSignedIn || false;
  };

  /**
   * Get user display name
   */
  const getUserDisplayName = (): string => {
    if (!user) return "Guest";

    if (user.fullName) return user.fullName;
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    if (user.username) return user.username;
    if (user.primaryEmailAddress) {
      return user.primaryEmailAddress.emailAddress.split("@")[0];
    }

    return "User";
  };

  /**
   * Get user email
   */
  const getUserEmail = (): string | null => {
    return user?.primaryEmailAddress?.emailAddress || null;
  };

  const getUserImage = (): string | null => {
    return user?.imageUrl || null;
  };

  /**
   * Get user ID
   */
  const getUserId = (): string | null => {
    return user?.id || null;
  };

  return {
    // Auth state
    isLoaded,
    isSignedIn,
    isAuthenticated,
    user,

    // User info
    getUserId,
    getUserEmail,
    getUserDisplayName,
    getUserImage,
    getUserRole,
    hasRole,

    // Actions
    signOut,
  };
}

/**
 * Auth guard component props
 */
interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireAuth?: boolean;
  requireRole?: string;
}

/**
 * Component to protect routes that require authentication
 */
export function AuthGuard({
  children,
  fallback = null,
  requireAuth = true,
  requireRole,
}: AuthGuardProps) {
  const { isSignedIn, isLoaded, hasRole } = useAuth();

  if (!isLoaded) {
    return null; // Or a loading spinner
  }

  if (requireAuth && !isSignedIn) {
    return <>{fallback}</>;
  }

  if (requireRole && !hasRole(requireRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Navigation guard for auth routes
 */
export function useAuthNavigation() {
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const navigateToHome = () => {
    router.replace("/(tabs)");
  };

  const navigateToSignIn = () => {
    router.replace("/sign-in");
  };

  const navigateBasedOnAuth = () => {
    if (isSignedIn) {
      navigateToHome();
    } else {
      navigateToSignIn();
    }
  };

  return {
    navigateToHome,
    navigateToSignIn,
    navigateBasedOnAuth,
  };
}
