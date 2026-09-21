import { colorScheme } from "nativewind";

import { getItem, setItem, StorageKeys } from "./storage";
import { parseThemePreference, type ThemePreference } from "./theme";

/**
 * Reading and applying the customer's theme choice.
 *
 * ── Why this exists now ───────────────────────────────────────────────────
 *
 * `app/_layout.tsx` pinned the app to light with a comment saying to revisit
 * it "the moment a settings screen exists to let someone choose". One does,
 * so the pin became a default: `DEFAULT_THEME` in `./theme` keeps the
 * original behaviour for everyone who never opens Settings.
 *
 * ── "system" is a real third option, not the absence of a choice ─────────
 *
 * NativeWind models exactly these three, and `colorScheme.set("system")` is
 * what re-attaches to the OS after an explicit choice. A boolean would make
 * "follow my phone" unreachable once anyone had ever picked.
 *
 * The validation itself lives in `./theme`, which is pure and tested.
 */

export { DEFAULT_THEME, describeTheme, type ThemePreference } from "./theme";

export function readThemePreference(): ThemePreference {
  return parseThemePreference(getItem(StorageKeys.theme));
}

/**
 * Apply a preference, and remember it.
 *
 * `colorScheme.set` is the single store both NativeWind's classes and this
 * app's `useTokenColors()` read from, so this one call repaints everything —
 * there is no second place to keep in step.
 */
export function setThemePreference(next: ThemePreference): void {
  setItem(StorageKeys.theme, next);
  colorScheme.set(next);
}

/**
 * Apply whatever was stored, before the first paint.
 *
 * Called at module scope from the root layout rather than in an effect, for
 * the reason its own comment gives: an effect runs after the first frame,
 * which is a visible flash of the wrong theme on every cold start.
 */
export function applyStoredTheme(): void {
  colorScheme.set(readThemePreference());
}
