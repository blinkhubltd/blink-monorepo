"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import {
  User,
  UserRole,
  Permission,
  hasPermission,
  canAccessRoute,
  isManager,
  getUnauthorizedMessage,
} from "./permissions";

interface AuthContextType {
  user: User | null;
  currentUser: User | null; // Alias for compatibility
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  hasPermission: (permission: Permission) => boolean;
  canAccessRoute: (route: string) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  getUnauthorizedMessage: (context?: string) => string;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Query user data from Convex
  const userData = useQuery(
    api.user.users.getCurrentUser,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );
  const roleData = useQuery(
    api.user.roles.getRole,
    userData?.role_id ? { id: userData.role_id } : "skip",
  );

  const authorizedRoles = useQuery(api.user.users.getAdminRoles);

  useEffect(() => {
    if (!clerkLoaded) {
      setIsLoading(true);
      return;
    }

    if (!clerkUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (userData === undefined) {
      return;
    }

    if (!userData) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setUser({ ...userData } as User);
    setIsLoading(false);
  }, [clerkLoaded, clerkUser, userData, roleData]);

  const contextValue: AuthContextType = {
    user,
    currentUser: user, // Alias for compatibility
    isLoading,
    isAuthenticated: !!clerkUser && !!user,
    isAuthorized:
      authorizedRoles?.some((r: any) => r._id === userData?.role_id) ?? false,
    hasPermission: (permission: Permission) => hasPermission(user, permission),
    canAccessRoute: (route: string) => canAccessRoute(user, route),
    isAdmin:
      authorizedRoles?.some((r: any) => r._id === userData?.role_id) ?? false,
    isManager: isManager(user),
    getUnauthorizedMessage: (context?: string) =>
      getUnauthorizedMessage(user, context),
    refetch: () => {
      // Force refetch by clearing the user state
      setIsLoading(true);
      setUser(null);
    },
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Convenience hooks
export function usePermissions() {
  const { hasPermission } = useAuth();
  return { hasPermission };
}

export function useRouteAccess() {
  const { canAccessRoute } = useAuth();
  return { canAccessRoute };
}

export function useAuthGuard() {
  const auth = useAuth();

  const requireAuth = () => {
    if (!auth.isAuthenticated) {
      throw new Error("Authentication required");
    }
    return auth.user!;
  };

  const requireAuthorization = () => {
    if (!auth.isAuthenticated) {
      throw new Error("Authentication required");
    }
    if (!auth.isAuthorized) {
      throw new Error(auth.getUnauthorizedMessage());
    }
    return auth.user!;
  };

  return {
    ...auth,
    requireAuth,
    requireAuthorization,
    requirePermission: (permission: Permission) => {
      const user = requireAuthorization();
      if (!auth.hasPermission(permission)) {
        throw new Error(
          auth.getUnauthorizedMessage(`Missing permission: ${permission}`),
        );
      }
      return user;
    },
    requireRouteAccess: (route: string) => {
      const user = requireAuthorization();
      if (!auth.canAccessRoute(route)) {
        throw new Error(
          auth.getUnauthorizedMessage(`Route access denied: ${route}`),
        );
      }
      return user;
    },
  };
}
