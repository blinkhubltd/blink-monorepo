import { Redirect } from "expo-router";

/**
 * `/saved` moved to the Wishlist tab. This keeps the old path working.
 *
 * Not defensive padding — there are two live sources of `/saved` that a rename
 * cannot reach:
 *
 * 1. `lib/notification-kind.ts` translates the routes the backend stores on
 *    notification rows, and rows written before this change still say `/saved`.
 *    Those are data, not code; they cannot be migrated from here.
 * 2. `app/notifications.tsx` pushes that stored route through
 *    `router.push(destination as never)`. The `as never` defeats typed routes
 *    entirely, so a stale path fails at RUNTIME, on a customer's device, when
 *    they tap a real push notification — with a perfectly green typecheck.
 *
 * A six-line redirect makes that whole class of failure impossible. Deleting
 * this file is only safe once no stored notification can still name `/saved`,
 * which is not a thing this codebase can currently prove.
 */
export default function SavedRedirect() {
  return <Redirect href="/wishlist" />;
}
