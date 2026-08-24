/**
 * DS money format: "Ksh 160.00" — always the currency prefix, always two
 * decimals, thousands separated. Never a bare number, never a symbol.
 */
export function formatMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Ksh ${safe.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole-shilling variant for compact places (stat tiles, badges). */
export function formatMoneyCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Ksh ${Math.round(safe).toLocaleString("en-KE")}`;
}

/** Two-letter initials for the avatar. Falls back rather than throwing. */
export function initials(name: string | null | undefined): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** "08:32" from a timestamp, in the device timezone. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Greeting by hour. `now` is a parameter, never read from the clock inside,
 * so this stays testable.
 */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
