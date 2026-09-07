import { useMemo } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ClerkProvider, useAuth, type TokenCache } from "@clerk/clerk-expo";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

/**
 * Session tokens go to the Keychain / Android Keystore, not AsyncStorage.
 *
 * Clerk keeps them in memory by default, which signs the crew member out on
 * every cold start — unacceptable for someone using the app on a bike all day.
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
    // Deliberately not defaulted. The reference ecommerce app carried a
    // hardcoded fallback deployment URL, which meant a misconfigured build
    // silently talked to the wrong backend instead of failing.
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL is not set. Copy apps/rider/.env.example to .env.local.",
    );
  }
  return url;
}

/**
 * Read here, in first-party source, and passed explicitly below.
 *
 * `@clerk/clerk-expo` falls back to `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
 * itself when the prop is omitted (ClerkProvider.js:54), which works in
 * development and fails in every release build: `babel-preset-expo` inlines
 * `process.env.EXPO_PUBLIC_*` only where first-party code references it, never
 * inside Clerk's shipped dist, so at runtime the fallback resolves to `""` and
 * ClerkProvider throws "Missing publishableKey" on the first render.
 *
 * `lib/location-task.ts` reading the same variable does not rescue this —
 * inlining is per reference, per file, and Clerk's own read site is a different
 * file. Diagnosed from a launch crash in apps/shop; the same omission was here.
 */
function readClerkPublishableKey(): string {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Copy apps/rider/.env.example to .env.local.",
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
