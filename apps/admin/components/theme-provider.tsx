"use client";

import type React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme state for the dashboard.
 *
 * ── Why the toggle did nothing ────────────────────────────────────────────
 *
 * `components/header.tsx` has called `useTheme()` since the dashboard port, but
 * no provider was ever mounted — `grep -rn "ThemeProvider" apps/admin` returned
 * exactly one line, the `useTheme` import itself. Without a provider next-themes
 * has nowhere to write, so `setTheme` resolved to a no-op and `resolvedTheme`
 * stayed `undefined`. The button rendered, took the click, and changed nothing.
 *
 * That also explains why the header showed the light-mode icon permanently: it
 * picks the icon off `resolvedTheme`, which was never anything.
 *
 * ── attribute="class" is not the default choice, it is the required one ───
 *
 * `packages/config/tailwind/base.css` declares
 * `@custom-variant dark (&:is(.dark *))` and defines its dark palette under a
 * `.dark` block. So the theme has to be applied as a CLASS on the root element.
 * next-themes' `attribute="data-theme"` would set an attribute nothing in the
 * stylesheet selects on, and every `dark:` utility in the app would stay inert —
 * a toggle that appears to work while changing nothing visible.
 *
 * ── disableTransitionOnChange ────────────────────────────────────────────
 *
 * Without it, every element carrying a colour transition animates its way from
 * the old palette to the new one, so switching mode washes across the screen for
 * a few hundred milliseconds. next-themes suppresses transitions for one frame
 * instead, which is what makes the switch read as instant.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // Follow the operating system until the user states a preference. An
      // admin tool opened at night on a dark desktop should not arrive white.
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
