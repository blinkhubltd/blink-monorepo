import type React from "react";

/**
 * The auth shell.
 *
 * A route group, so `/sign-in` and `/setup` keep their URLs while sitting
 * outside the dashboard layout — they must not mount the sidebar,
 * `DashboardDataProvider` or `AuthorizationWrapper`, all of which assume a
 * signed-in user with a role. Mounting the provider on the sign-in page would
 * fire a dozen dashboard queries at a visitor who has no session.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="bg-background min-h-svh">{children}</div>;
}
