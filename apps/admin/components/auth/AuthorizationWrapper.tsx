"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { canViewDashboardPath } from "@/lib/dashboard-permissions";

interface AuthorizationWrapperProps {
  children: React.ReactNode;
  fallbackComponent?: React.ComponentType;
}

export function AuthorizationWrapper({
  children,
  fallbackComponent: FallbackComponent,
}: AuthorizationWrapperProps) {
  const { isLoading, convexUser, permissions, isAdminUser } =
    useCurrentUserPermissions();
  const router = useRouter();
  const pathname = usePathname();

  if (!isLoading && !convexUser) {
    router.replace("/unauthorized");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  const canViewCurrentModule = canViewDashboardPath(permissions, pathname);

  // Admin users have absolute access to every route
  if (!isLoading && !isAdminUser && !canViewCurrentModule) {
    router.replace("/unauthorized");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthorizationWrapper;
