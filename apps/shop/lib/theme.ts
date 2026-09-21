/**
 * What a theme choice can be, and how to read one back safely.
 *
 * Pure, and split from `theme-preference.ts` for the same reason
 * `address-label.ts` is split from `use-address-label.ts`: that module
 * imports NativeWind and MMKV, neither of which a unit test can load, and
 * the part worth testing is this — what happens to a stored value that is
 * missing, empty, or something no version of this app ever wrote.
 */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
];

/**
 * Light, not "system".
 *
 * Carried over from the hard pin this replaces: dark mode has never been
 * tested end to end, so following the OS would opt people into it silently.
 * A customer who picks it in Settings has chosen it; a customer who never
 * opens Settings has not.
 */
export const DEFAULT_THEME: ThemePreference = "light";

export function parseThemePreference(
  stored: string | null | undefined,
): ThemePreference {
  return THEME_PREFERENCES.includes(stored as ThemePreference)
    ? (stored as ThemePreference)
    : DEFAULT_THEME;
}

/** The label shown in Settings. */
export function describeTheme(preference: ThemePreference): string {
  if (preference === "light") return "Light";
  if (preference === "dark") return "Dark";
  return "Match my phone";
}
