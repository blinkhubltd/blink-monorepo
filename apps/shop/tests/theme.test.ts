import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  describeTheme,
  parseThemePreference,
  THEME_PREFERENCES,
} from "../lib/theme";

describe("parseThemePreference", () => {
  it("accepts each of the three real choices", () => {
    for (const value of THEME_PREFERENCES) {
      expect(parseThemePreference(value)).toBe(value);
    }
  });

  it("falls back to light when nothing has been chosen", () => {
    // The first launch, and every launch before Settings existed.
    expect(parseThemePreference(null)).toBe("light");
    expect(parseThemePreference(undefined)).toBe("light");
    expect(parseThemePreference("")).toBe("light");
  });

  it("falls back rather than trusting a value no version ever wrote", () => {
    // Storage outlives the code that wrote it. A renamed or removed option
    // must degrade to the default, not reach `colorScheme.set` unchecked.
    expect(parseThemePreference("midnight")).toBe("light");
    expect(parseThemePreference("SYSTEM")).toBe("light");
    expect(parseThemePreference("{}")).toBe("light");
  });

  it("defaults to light rather than following the OS", () => {
    // Deliberate, and the reason the hard pin in _layout.tsx could be
    // relaxed safely: dark mode is opt-in, never inherited.
    expect(DEFAULT_THEME).toBe("light");
  });
});

describe("describeTheme", () => {
  it("names every choice", () => {
    expect(describeTheme("light")).toBe("Light");
    expect(describeTheme("dark")).toBe("Dark");
    expect(describeTheme("system")).toBe("Match my phone");
  });
});
