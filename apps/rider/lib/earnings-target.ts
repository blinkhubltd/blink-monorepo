import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * The rider's own weekly earnings goal, in shillings.
 *
 * ── Why on the phone, not the backend ────────────────────────────────────
 *
 * The backend's `user_incentive_targets` holds a target in DELIVERIES, which
 * is a different quantity from the design's "what you want to take home by
 * Saturday night". Writing a shilling figure into a delivery-count column
 * would corrupt what the dashboard reports; converting it into a count would
 * rewrite that column every day as the pace changed. This is a personal goal
 * that drives one calculator on one screen, so it lives with the rider.
 *
 * SecureStore rather than a plain store only because it is the key-value
 * storage this app already carries; the value is not secret.
 */

const KEY = "blink.rider.weeklyEarningsTarget";

/** The design's middle preset, used until the rider picks one. */
export const DEFAULT_WEEKLY_TARGET = 10_000;
export const TARGET_PRESETS = [8_000, 10_000, 12_000] as const;

export function parseTarget(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  // Capped so a stray paste cannot put an eleven-digit goal on the screen.
  return Math.min(Number(digits), 10_000_000);
}

export function useWeeklyEarningsTarget(): [number, (next: number) => void] {
  const [target, setTarget] = useState(DEFAULT_WEEKLY_TARGET);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(KEY)
      .then((stored) => {
        if (cancelled || stored === null) return;
        const n = parseTarget(stored);
        if (n > 0) setTarget(n);
      })
      .catch(() => {
        // Unreadable: keep the default rather than showing no target at all.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: number) => {
    setTarget(next);
    // Fire and forget: the goal on screen is already right, and a failed
    // write only means tomorrow opens on the previous one.
    void SecureStore.setItemAsync(KEY, String(next)).catch(() => {});
  }, []);

  return [target, update];
}
