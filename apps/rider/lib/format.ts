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

/**
 * "Today · 24 Sep 2026", "Yesterday · 23 Sep 2026", or just the date.
 *
 * The relative word is what a rider scanning their history reads first; the
 * date is kept alongside it because "today" stops being true the moment the
 * screen is screenshotted for a dispute. `now` is a parameter, as everywhere.
 */
export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function formatDay(ms: number, now: number): string {
  // A fixed table, not toLocaleDateString: ICU builds disagree on the short
  // month ("Sep" on some, "Sept" on Node's), so the locale API would make the
  // same timestamp read differently on a phone and in a test.
  const d = new Date(ms);
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(ms)) / (24 * 60 * 60 * 1000));
  if (days === 0) return `Today \u00B7 ${date}`;
  if (days === 1) return `Yesterday \u00B7 ${date}`;
  return date;
}
