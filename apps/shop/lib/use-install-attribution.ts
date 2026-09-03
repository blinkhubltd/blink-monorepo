import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";

import { parseAgentCodeFromReferrer } from "./install-attribution";
import {
  getItem,
  removeItem,
  setItem,
  StorageKeys,
} from "./storage";

/**
 * Android install crediting: read the Play Install Referrer once, submit it
 * once a session exists.
 *
 * ── The two-step shape, and why ────────────────────────────────────────
 *
 * The referrer is available from launch — before the customer has necessarily
 * signed in, since browsing is guest-friendly. `attributeMyInstall` requires a
 * real account, the same way `attributeMyRegistration` does. So the code found
 * at launch is held in storage (not just component state — a cold start
 * between finding it and signing in must not lose it) and submitted the
 * moment `isSignedIn` turns true, mirroring how the guest basket merges on
 * sign-in.
 *
 * ── Queried at most once, ever ────────────────────────────────────────
 *
 * `installReferrerChecked` is set whether or not a code was found. Google's own
 * guidance is to call the API once, shortly after install; the value cannot
 * change afterwards regardless, so querying again on every cold start would
 * only cost a call for no new information — and would eventually run against
 * an app that has long since stopped being "just installed," at which point
 * the API's own behaviour is undefined.
 *
 * ── Mount this once, at the root ──────────────────────────────────────
 *
 * Not per-screen. A second mount would re-run the submit effect redundantly
 * (harmless — `attributeMyInstall` is idempotent — but pointless) and there is
 * exactly one place this needs to live.
 */
export function useInstallAttribution() {
  const { isLoaded, isSignedIn } = useAuth();
  const attribute = useMutation(api.data.marketing.attributeMyInstall);
  const submitted = useRef(false);

  // Query the Install Referrer API, once, ever — and only on Android; iOS has
  // no equivalent, so there is nothing to check.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (getItem(StorageKeys.installReferrerChecked)) return;

    let cancelled = false;

    // Required lazily, matching lib/storage.ts's own pattern: an unlinked
    // native module degrades (nothing is ever found) rather than taking the
    // whole bundle down at import time.
    void (async () => {
      try {
        const { PlayInstallReferrer } = await import(
          "react-native-play-install-referrer"
        );
        PlayInstallReferrer.getInstallReferrerInfo((info, error) => {
          if (cancelled) return;
          setItem(StorageKeys.installReferrerChecked, "1");
          if (error || !info) return;
          const code = parseAgentCodeFromReferrer(info.installReferrer);
          if (code) setItem(StorageKeys.pendingInstallCode, code);
        });
      } catch {
        // The native module is not linked, or this build predates it. Do not
        // mark "checked" — a build that gets the module later should still
        // get one real chance to query it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Submit whatever was found, once a session exists to credit it against.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (!isLoaded || !isSignedIn || submitted.current) return;

    const code = getItem(StorageKeys.pendingInstallCode);
    if (!code) return;

    submitted.current = true;
    void (async () => {
      try {
        // Cleared on every answer the mutation actually gives — including
        // "already" and "unknown" — because none of those become true on a
        // retry, so holding onto the code would only mean re-submitting the
        // same answer forever.
        await attribute({ agentCode: code });
        removeItem(StorageKeys.pendingInstallCode);
      } catch {
        // Silent by design — this is a background credit, not a customer
        // action with a screen to report failure on. Only a genuine network
        // failure reaches here (the mutation reports "already"/"self"/
        // "unknown" as a normal return, not a throw), so the code is left in
        // place and the latch is released — the next sign-in retries it,
        // rather than losing the attribution to one bad request.
        submitted.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, attribute]);
}
