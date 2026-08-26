"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { canViewDashboardPath } from "@/lib/dashboard-permissions";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

/**
 * Gate for every dashboard page.
 *
 * ── Three things fixed ────────────────────────────────────────────────────
 *
 * 1. It called `router.replace()` DURING RENDER. Navigating is a side effect;
 *    doing it in the render body fires twice under StrictMode and makes React
 *    warn about updating a component while rendering. It is now in an effect.
 *
 * 2. It rendered a spinner whenever `isLoading` was true, and `isLoading` could
 *    never become false for a signed-out user — see the note in
 *    `useCurrentUserPermissions`. Together with the missing middleware, that is
 *    the "loads forever, never redirects to sign-in" behaviour.
 *
 * 3. It sent every unrecognised user to `/unauthorized`. But "you have no role
 *    yet" and "your role does not cover this page" are different situations with
 *    different fixes, and on a fresh deployment the first is the NORMAL state —
 *    sending the very first administrator to a dead end labelled "unauthorized"
 *    is how a new install comes to look broken. No role now goes to `/setup`.
 *
 * The loading state mirrors the dashboard's own shape rather than a centred
 * spinner, so the page does not jump when it resolves.
 */
export function AuthorizationWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, hasConvexUser, hasRole, permissions, isSuperAdmin } =
    useCurrentUserPermissions();
  const router = useRouter();
  const pathname = usePathname();

  const canViewCurrentModule =
    isSuperAdmin || canViewDashboardPath(permissions, pathname);

  // Where this user should be, or null if they are already in the right place.
  // Computed in the render body so the effect has no logic of its own to drift
  // out of step with what gets rendered.
  let destination: string | null = null;
  if (!isLoading) {
    if (!hasConvexUser || !hasRole) {
      // No Convex row, or a row with no role. Both are setup problems, and
      // /setup distinguishes them and says what to do about each.
      destination = "/setup";
    } else if (!canViewCurrentModule) {
      destination = "/unauthorized";
    }
  }

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  // Skeleton while loading, and also while a redirect is in flight — rendering
  // children for a user we are about to move would flash content they are not
  // entitled to see.
  if (isLoading || destination) return <DashboardSkeleton />;

  return <>{children}</>;
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-svh">
      <Skeleton className="hidden w-64 rounded-none md:block" />
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default AuthorizationWrapper;
