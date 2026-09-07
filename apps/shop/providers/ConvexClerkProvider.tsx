import { useMemo } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ClerkProvider, useAuth, type TokenCache } from "@clerk/clerk-expo";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

/**
 * Convex + Clerk for the customer app.
 *
 * ── This provider must render its children while signed OUT ───────────────
 *
 * Customers browse the catalogue before they have an account, and every
 * category and product query is callable unauthenticated. So there is
 * deliberately no auth gate here and no loading state that withholds
 * `children` until Clerk resolves. Holding the tree until `isLoaded` is the
 * usual way guest browsing silently breaks: the app looks like it is loading
 * forever to anyone who has not signed in.
 *
 * Auth gating happens at one place only — checkout — and it is a modal pushed
 * over the current URL, not a redirect. See app/(auth)/.
 */

/**
 * Session tokens go to the Keychain / Android Keystore, not AsyncStorage.
 *
 * Clerk keeps them in memory by default, which signs the customer out on every
 * cold start and loses their cart with them.
 */
const tokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // A corrupt or unreadable entry must not brick sign-in. Clear it and let
      // Clerk fall back to a fresh sign-in rather than throwing on boot.
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // Nothing further to do; the key is unreadable either way.
      }
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Failing to persist degrades to in-memory, which is survivable.
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore.
    }
  },
};

function readConvexUrl(): string {
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!url) {
    // Deliberately not defaulted. blink-ecommerce hardcoded a fallback
    // deployment URL (`https://wary-dogfish-636.convex.cloud`) at
    // providers/ConvexClientProvider.tsx:9, which meant a misconfigured build
    // silently talked to somebody else's backend instead of failing.
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL is not set. Copy apps/shop/.env.example to .env.local.",
    );
  }
  return url;
}

/**
 * ── This MUST be read here, in first-party source. ────────────────────────
 *
 * `@clerk/clerk-expo`'s ClerkProvider falls back to
 * `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` when no `publishableKey`
 * prop is passed (ClerkProvider.js:54), so omitting the prop looks like it
 * works — and it does, in development, where `process.env` is a real object
 * served by Metro.
 *
 * It does not work in a release build. `babel-preset-expo`'s
 * `expo-inline-or-reference-env-vars` plugin replaces `process.env.EXPO_PUBLIC_*`
 * with a literal at bundle time, and it only does so for files it transforms as
 * first-party code — not for Clerk's shipped dist. Inside node_modules the
 * expression survives to runtime, where React Native's `process.env` has no such
 * key, so Clerk's fallback chain lands on `""` and ClerkProvider throws
 * "Missing publishableKey" on the very first render. That crashed every EAS
 * build on launch: the key was present in the EAS environment and `app.config.ts`
 * verified it, but nothing bundled ever referenced it, so it was never inlined.
 *
 * Verified by exporting a production bundle with a sentinel value: the Convex URL
 * and Paystack key (both read in first-party source) appear in the bundle; the
 * Clerk key did not appear at all until this function existed.
 *
 * So: read it here and pass it explicitly. The reference below is what makes the
 * value exist in the bundle.
 */
function readClerkPublishableKey(): string {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Copy apps/shop/.env.example to .env.local.",
    );
  }
  return key;
}

export function ConvexClerkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(
    () =>
      new ConvexReactClient(readConvexUrl(), {
        // Web has no app-backgrounding equivalent; on native this stops the
        // websocket churning while the screen is off.
        unsavedChangesWarning: Platform.OS === "web" ? undefined : false,
      }),
    [],
  );

  return (
    <ClerkProvider
      publishableKey={readClerkPublishableKey()}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
