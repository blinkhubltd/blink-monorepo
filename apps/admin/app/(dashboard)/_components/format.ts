/**
 * Formatting for the overview widgets.
 *
 * Kept separate from the chart components so the number handling is readable on
 * its own — these are the functions that decide what a manager sees, and a
 * rounding or sign mistake here is invisible in a rendered chart.
 */

/** "Ksh 1.2M" / "Ksh 84k" / "Ksh 950" — compact, for axes and stat tiles. */
export function compactKES(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}Ksh ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}Ksh ${Math.round(abs / 1_000)}k`;
  return `${sign}Ksh ${Math.round(abs)}`;
}

/** Full precision, for tooltips and totals where the exact figure matters. */
export function fullKES(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Ksh ${safe.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "12 Aug" — short enough for a dense axis. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export interface Delta {
  /** Signed percentage change. */
  percent: number;
  direction: "up" | "down" | "flat";
  label: string;
}

/**
 * Period-over-period change.
 *
 * The interesting case is a previous value of zero. A naive
 * `(current - previous) / previous` gives Infinity, which renders as "∞%" or
 * "NaN%" — so growth from nothing is reported as "new" instead of a percentage,
 * because there is no meaningful percentage to quote.
 */
export function delta(current: number, previous: number): Delta {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safePrevious = Number.isFinite(previous) ? previous : 0;

  if (safePrevious === 0) {
    if (safeCurrent === 0) {
      return { percent: 0, direction: "flat", label: "No change" };
    }
    return { percent: 0, direction: "up", label: "New this period" };
  }

  const percent = ((safeCurrent - safePrevious) / Math.abs(safePrevious)) * 100;
  const rounded = Math.round(percent * 10) / 10;
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";

  return {
    percent: rounded,
    direction,
    // The sign is carried in the text as well as the colour: a red arrow alone
    // is invisible to anyone who cannot separate red from green.
    label: `${rounded > 0 ? "+" : ""}${rounded}% vs last period`,
  };
}

/**
 * Chart series colours, taken from the theme rather than hardcoded.
 *
 * These are hex in @repo/tailwind, so the variable can be handed straight to
 * recharts. If they are ever converted to oklch, they must still be passed
 * directly — never wrapped in `hsl()`, which silently yields black.
 */
export const SERIES = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  info: "var(--chart-3)",
  success: "var(--chart-4)",
  danger: "var(--chart-5)",
} as const;

export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

/**
 * "45 min" / "4.2 hrs" / "1.8 days" — never "252 min".
 *
 * A dashboard that prints a raw millisecond or minute count makes the reader do
 * the division, and they will do it wrong at a glance.
 */
export function humanDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** "1.2M" / "84k" / "950" — for counts on axes and tiles. */
export function compactNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs).toLocaleString("en-KE")}`;
}

/** Plain count with thousands separators. */
export function count(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("en-KE");
}

/** "62%" — or an em dash when the rate is genuinely undefined. */
export function percent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}%`;
}
