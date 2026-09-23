import { SSO_CALLBACK_PATH } from "../lib/auth/use-social-sign-in";

/**
 * Deep links reach expo-router through here before they become navigations.
 *
 * The one link this app must NOT navigate on is the Google/Apple sign-in
 * callback (`blink://sso-callback?...`). It is consumed by
 * `lib/auth/use-social-sign-in.ts`; if expo-router also routes it, the sign-in
 * modal is replaced by a screen that does not exist (or, without the path, by
 * home) while the sign-in is still finishing underneath it.
 *
 * Returning null for a warm link tells expo-router to ignore it. On a cold
 * start — the process was killed while the browser tab was open — there is no
 * flow left to finish it, so it opens home rather than a not-found screen.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (!path.includes(SSO_CALLBACK_PATH)) return path;
  return initial ? "/" : null;
}
