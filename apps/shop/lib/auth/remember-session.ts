import { getItem, setItem, StorageKeys } from "../storage";

/**
 * What the "Remember me" checkbox actually does.
 *
 * ── Why it needs code at all ─────────────────────────────────────────────
 *
 * Clerk's Expo SDK persists the session in the token cache unconditionally, so
 * left alone the checkbox would be decoration — checked or not, you would stay
 * signed in. A control that states a promise it does not keep is worse than no
 * control, and the handoff states the promise: "'Remember me' persists the
 * session; default on."
 *
 * So the choice is written here at sign-in, and honoured on the next COLD
 * START: unchecked means the session is ended the next time the app is
 * launched, which is what "don't remember me" means on a shared phone. It
 * deliberately does not sign out on backgrounding — switching to Maps to
 * check an address and coming back is not "leaving".
 *
 * ── Why the absence of a value means "remember" ──────────────────────────
 *
 * Everyone signed in before this shipped has no stored value, and their
 * session is the one thing that must not be dropped by an upgrade. Unset
 * therefore reads as remembered, matching both the default and the existing
 * behaviour.
 */

export function setRememberSession(remember: boolean): void {
  setItem(StorageKeys.rememberSession, remember ? "true" : "false");
}

export function shouldRememberSession(): boolean {
  return getItem(StorageKeys.rememberSession) !== "false";
}

/** After acting on the choice, so one cold start does not sign out twice. */
export function clearRememberSession(): void {
  setItem(StorageKeys.rememberSession, "true");
}
