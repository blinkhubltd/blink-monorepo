import { Stack } from "expo-router";

/**
 * Auth is a modal group, presented OVER whatever route the customer is on.
 *
 * Never a redirect to an auth route. The URL does not change while signing in,
 * so a reload mid-checkout returns to checkout rather than to the home screen —
 * which is what removes two of the eight refresh-to-home causes structurally
 * instead of patching them.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
