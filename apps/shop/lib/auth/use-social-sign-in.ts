import { useCallback, useState } from "react";
import { useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

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
 * ── `useSSO`, not `useOAuth` ────────────────────────────────────────────
 *
 * `useOAuth` is Clerk's older, per-provider API (`useOAuth({ strategy:
 * "oauth_google" })` for each). `useSSO` is the current one: a single
 * `startSSOFlow({ strategy })` for every provider, including enterprise SSO.
 * Both call it the same way here, so there is no per-provider branching to keep
 * in sync.
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
 * `startSSOFlow` fails with a Clerk error naming the missing strategy, which
 * this hook surfaces as-is rather than translating into something vaguer.
 */

export type SocialProvider = "google" | "apple";

WebBrowser.maybeCompleteAuthSession();

function strategyFor(provider: SocialProvider): "oauth_google" | "oauth_apple" {
  return provider === "google" ? "oauth_google" : "oauth_apple";
}

export function useSocialSignIn(onDone: () => void) {
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signInWith = useCallback(
    async (provider: SocialProvider) => {
      setError(null);
      setPending(provider);
      try {
        const { createdSessionId, setActive, signIn, signUp } =
          await startSSOFlow({
            strategy: strategyFor(provider),
            // The native redirect URI for this app's own scheme (`blink://`,
            // set in app.config.ts) — Expo Auth Session builds the one Clerk
            // needs to hand control back to this app rather than a browser tab.
            redirectUrl: AuthSession.makeRedirectUri(),
          });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          onDone();
          return;
        }

        // No session and no error thrown: Clerk needs another step it cannot
        // resolve from an OAuth redirect alone — most commonly a second
        // factor, or a required field sign-up collects that Google/Apple did
        // not supply. `signIn`/`signUp` carry what is missing; surfaced
        // generically for now rather than building a second adaptive flow for
        // a path that needs an account already reachable to test against.
        if (signIn || signUp) {
          setError(
            "That account needs one more step to finish signing in. Try email instead.",
          );
          return;
        }

        setError("Sign-in was not completed. Please try again.");
      } catch (caught) {
        // Cancelling the browser tab throws here too — WebBrowser's own
        // result type does not distinguish it from a real failure in every
        // case, so this reads as "try again" rather than a scary error either
        // way, which is the safe default for a cancel.
        setError(
          caught instanceof Error
            ? caught.message
            : "Sign-in was not completed. Please try again.",
        );
      } finally {
        setPending(null);
      }
    },
    [startSSOFlow, onDone],
  );

  return {
    signInWith,
    /** The provider currently mid-flow, or null. Drives per-button loading state. */
    pending,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
