import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The publishable key must be read in first-party source, not left to Clerk.
 *
 * `@clerk/clerk-expo`'s ClerkProvider resolves its key as
 *
 *     publishableKey || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || ...  || ""
 *
 * so omitting the prop appears to work — and does, under `expo start`, where
 * `process.env` is a live object served by Metro.
 *
 * It fails in every release build. `babel-preset-expo`'s
 * `expo-inline-or-reference-env-vars` plugin rewrites `process.env.EXPO_PUBLIC_*`
 * into a string literal at bundle time, and only for files transformed as
 * first-party code — never for Clerk's shipped dist under node_modules. There the
 * expression survives into the bundle, React Native's `process.env` has no such
 * key at runtime, Clerk's fallback chain lands on `""`, and ClerkProvider throws
 * "Missing publishableKey" during the first render of the root layout. The app
 * crashes on launch with no way to reach a screen.
 *
 * This is not caught by anything else in the stack, which is why it needs a test:
 * `app.config.ts` verifies the variable is *present at build time* and the EAS
 * environment supplied it correctly, but neither makes it reachable from the
 * bundle. Nothing bundled referenced it, so nothing inlined it.
 *
 * Confirmed by exporting a production bundle with sentinel values: the Convex URL
 * and Paystack key, both read in first-party source, appeared in the Hermes
 * bundle; the Clerk key was absent entirely until the provider read it directly.
 */

const APPS = ["shop", "rider"] as const;

function readProvider(app: string): string {
  return readFileSync(
    join(__dirname, "..", "..", app, "providers", "ConvexClerkProvider.tsx"),
    "utf8",
  );
}

describe.each(APPS)("%s: ClerkProvider receives an explicit key", (app) => {
  const source = readProvider(app);

  it("passes a publishableKey prop rather than relying on Clerk's env fallback", () => {
    // The prop, not the variable name, is what matters: Clerk only skips its
    // own (unbundleable) fallback when the prop is actually supplied.
    expect(source).toMatch(/<ClerkProvider[\s\S]*?publishableKey=\{/);
  });

  it("references the env variable in first-party source, so Babel inlines it", () => {
    // This exact expression is what the inlining plugin looks for. Reading the
    // key indirectly — from `extra`, a config object, or a re-exported constant
    // built elsewhere — would compile but bundle to undefined again.
    expect(source).toContain("process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });

  it("fails loudly when the key is missing instead of passing an empty string", () => {
    // A `?? ""` or `!` here would restore the original crash, just later and
    // with a worse message. Matches how the file already treats the Convex URL.
    expect(source).toMatch(/EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set/);
  });
});
