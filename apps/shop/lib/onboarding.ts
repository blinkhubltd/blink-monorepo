import { getItem, setItem, StorageKeys } from "./storage";

/**
 * Whether the onboarding carousel has been shown.
 *
 * Read synchronously, because `lib/storage.ts` is synchronous by design — an
 * async read here would mean the catalogue paints first and the onboarding
 * screen slams over it a frame later, on every first launch.
 *
 * ── Why "seen" rather than "signed in" ───────────────────────────────────
 *
 * Onboarding is not a gate on having an account. Browsing this app without one
 * is deliberate and supported (guest carts, guest checkout prompts), so
 * showing the carousel again to someone who declined to sign up would be
 * nagging, not onboarding. It is shown once and then never again.
 */
export function hasSeenOnboarding(): boolean {
  return getItem(StorageKeys.onboardingSeen) === "true";
}

export function markOnboardingSeen(): void {
  setItem(StorageKeys.onboardingSeen, "true");
}
