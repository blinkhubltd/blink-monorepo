import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import {
  isClerkAPIResponseError,
  useSignIn,
  useSignUp,
} from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import { useToast } from "../../providers/ToastProvider";
import { setRememberSession } from "./remember-session";

/**
 * Google and Apple sign-in, via Clerk's SSO flow.
 *
 * ── Why a separate hook, not folded into `use-sign-in-flow.ts` ────────────
 *
 * That hook is a state machine over `signIn.create()`/`signUp.create()` and the
 * adaptive-factor dance Clerk's email/password flow needs. Social sign-in is a
 * different shape entirely — one round trip through a browser tab, then a
 * session id — and it does not touch any of that state. Sharing the file would
 * mean either machine reading the other's fields.
 *
 * ── Neither `useOAuth` nor `useSSO` ──────────────────────────────────────
 *
 * This is `useSSO`'s own sequence (clerk-expo 2.20, `dist/hooks/useSSO.js`)
 * written out, because two of its steps signed customers straight back out:
 *
 *  - **Android's dismiss race.** On Android, `openAuthSessionAsync` is a
 *    polyfill over Custom Tabs, AppState and Linking. When the app returns to
 *    the foreground before the callback link is delivered, it resolves
 *    `dismiss` and the link arrives a moment later to nobody. `useSSO` then
 *    returns no session, and Google's sign-in is thrown away. Here a second
 *    Linking listener catches the late link and the flow carries on.
 *  - **The callback became a navigation.** `useSSO` was given
 *    `makeRedirectUri()` with no path — `blink://` — and expo-router routes
 *    that deep link to `/`, which closed the sign-in modal and put the
 *    customer on home. Any error the flow then set rendered on a screen no
 *    longer showing, so what the customer saw was "not signed in" and
 *    nothing else.
 *
 * Owning the sequence does not change which providers or strategies are used.
 *
 * ── `WebBrowser.maybeCompleteAuthSession()` ────────────────────────────────
 *
 * Module-scope, called once. This is the half of the OAuth round trip that
 * closes the browser tab and hands control back to the app when the redirect
 * lands — without it, a completed sign-in leaves the browser tab open and the
 * app never resumes. Clerk's own Expo guide calls this out as the most common
 * thing to forget.
 *
 * ── Apple availability ─────────────────────────────────────────────────────
 *
 * `oauth_apple` genuinely is not offered on Android — Apple's own sign-in
 * cannot be. The screen decides which buttons to show; this hook only refuses
 * with a clear message if asked for one anyway, rather than silently no-op'ing.
 *
 * ── What still has to happen outside this code ────────────────────────────
 *
 * Google and Apple both have to be enabled as SSO connections in the Clerk
 * dashboard, each with its own real OAuth client (a Google Cloud Console OAuth
 * client id/secret; an Apple Services ID with Sign in with Apple configured).
 * Nothing here can do that — see `VERIFY.md` §5 for the checklist. Without it,
 * `signIn.create` fails with a Clerk error naming the missing strategy, which
 * this hook surfaces as-is rather than translating into something vaguer.
 */

export type SocialProvider = "google" | "apple";

WebBrowser.maybeCompleteAuthSession();

function strategyFor(provider: SocialProvider): "oauth_google" | "oauth_apple" {
  return provider === "google" ? "oauth_google" : "oauth_apple";
}

/**
 * The callback URL Clerk redirects to once Google/Apple are done. The
 * `sso-callback` path is Clerk's own default, and `app/+native-intent.ts`
 * keeps expo-router from treating it as a navigation (see there).
 */
export const SSO_CALLBACK_PATH = "sso-callback";

/**
 * How long to wait for the callback deep link after the browser reports it
 * closed without one. See "Android's dismiss race" above.
 */
const LATE_REDIRECT_MS = 2000;

function clerkMessage(caught: unknown, fallback: string): string {
  if (isClerkAPIResponseError(caught)) {
    return (
      caught.errors[0]?.longMessage ?? caught.errors[0]?.message ?? fallback
    );
  }
  return caught instanceof Error ? caught.message : fallback;
}

export function useSocialSignIn(onDone: () => void) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signUp } = useSignUp();
  const toast = useToast();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Every failure is reported twice, on purpose.
   *
   * The inline `error` renders on the sign-in screen, which is the right
   * place — but this flow leaves and re-enters the app through a browser, and
   * a redirect that expo-router decides to navigate on takes that screen down
   * with it. An error written only to state then lands on a screen nobody is
   * looking at, which is how a failing Google sign-in came to look like
   * nothing happening at all. The toast renders at the root, above whatever
   * screen the app ends up on, so the reason survives.
   *
   * `stage` names where it stopped rather than what to do about it, because
   * the steps are indistinguishable from outside: the log line is the only
   * thing that separates "the redirect never came back" from "Clerk refused".
   */
  const report = useCallback(
    (stage: string, message: string) => {
      if (__DEV__) console.warn(`[social-sign-in] ${stage}: ${message}`);
      setError(message);
      toast(message, "destructive");
    },
    [toast],
  );

  // Clerk's Expo guide: pre-warming Custom Tabs makes the Android hand-back
  // faster and more reliable. A no-op on iOS.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  /**
   * There is no "Remember me" beside these buttons, so the choice is the
   * default — on. It has to be written down all the same: the guard in
   * `app/_layout.tsx` signs out on the next cold start when the stored value
   * says not to remember, and a value left over from an earlier email sign-in
   * would otherwise end a session this flow had just created.
   */
  const activate = useCallback(
    async (session: string) => {
      setRememberSession(true);
      await setActive!({ session });
      if (__DEV__) console.log("[social-sign-in] session active");
      onDone();
    },
    [setActive, onDone],
  );

  const signInWith = useCallback(
    async (provider: SocialProvider) => {
      if (!isLoaded || !signIn || !signUp || !setActive) return;
      setError(null);
      setPending(provider);

      const redirectUrl = AuthSession.makeRedirectUri({
        path: SSO_CALLBACK_PATH,
      });

      // Listen for the callback ourselves, in parallel with WebBrowser's own
      // listener, so a redirect that lands after WebBrowser has already
      // given up is still caught.
      let lateUrl: string | null = null;
      let onLateUrl: (() => void) | null = null;
      const subscription = Linking.addEventListener("url", ({ url }) => {
        if (!url.startsWith(redirectUrl)) return;
        lateUrl = url;
        onLateUrl?.();
      });
      const waitForLateUrl = () =>
        new Promise<string | null>((resolve) => {
          if (lateUrl) return resolve(lateUrl);
          const timer = setTimeout(() => resolve(lateUrl), LATE_REDIRECT_MS);
          onLateUrl = () => {
            clearTimeout(timer);
            resolve(lateUrl);
          };
        });

      try {
        const started = await signIn.create({
          strategy: strategyFor(provider),
          redirectUrl,
        });
        const external =
          started.firstFactorVerification.externalVerificationRedirectURL;
        if (!external) {
          report("create", "Could not start sign-in. Please try again.");
          return;
        }

        const result = await WebBrowser.openAuthSessionAsync(
          external.toString(),
          redirectUrl,
        );
        const callbackUrl =
          result.type === "success" ? result.url : await waitForLateUrl();

        if (__DEV__) {
          console.log(
            `[social-sign-in] browser closed as "${result.type}"; callback ${
              callbackUrl ? "received" : "NOT received"
            }`,
          );
        }

        // Closed the tab without finishing. That is a cancel, not an error,
        // so it is logged above but not shown.
        if (!callbackUrl) return;

        const nonce =
          new URL(callbackUrl).searchParams.get("rotating_token_nonce") ?? "";
        const returned = await started.reload({ rotatingTokenNonce: nonce });

        if (returned.status === "complete" && returned.createdSessionId) {
          await activate(returned.createdSessionId);
          return;
        }

        // A Google/Apple account with no Blink account yet: Clerk verified
        // the provider and hands the sign-in over to a sign-up.
        if (returned.firstFactorVerification.status === "transferable") {
          const created = await signUp.create({ transfer: true });
          if (created.status === "complete" && created.createdSessionId) {
            await activate(created.createdSessionId);
            return;
          }
          // Named, not guessed: which field the instance still wants is the
          // whole diagnosis, and "one more step" hid it. This instance has
          // `password: required`, so a first-time Google account landing here
          // with `password` outstanding is the expected shape of that setting.
          report(
            "transfer",
            `Google could not finish creating your account — Clerk still wants: ${
              created.missingFields.join(", ") || created.status
            }. Try email instead.`,
          );
          return;
        }

        const reason =
          returned.firstFactorVerification.error?.longMessage ??
          returned.firstFactorVerification.error?.message;
        report(
          "reload",
          reason ??
            `Sign-in stopped at "${returned.status}" (verification: ${returned.firstFactorVerification.status}). Try email instead.`,
        );
      } catch (caught) {
        report(
          "threw",
          clerkMessage(caught, "Sign-in was not completed. Please try again."),
        );
      } finally {
        subscription.remove();
        onLateUrl = null;
        setPending(null);
      }
    },
    [isLoaded, signIn, signUp, setActive, activate, report],
  );

  return {
    signInWith,
    /** The provider currently mid-flow, or null. Drives per-button loading state. */
    pending,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
