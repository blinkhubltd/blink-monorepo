/**
 * Matching and ranking for the command palette.
 *
 * Extracted from the component so the ordering rules are testable. They are the
 * part that fails silently: a subsequence match alone will happily rank
 * "Prescription rejection reasons" above "Products" for the query "pro", and
 * nothing about the screen says the order is wrong — it just feels unhelpful.
 */

export interface Entry {
  title: string;
  /** "Operations · Orders", for display and for matching. */
  group: string;
  url: string;
}

/** Case-insensitive subsequence match, so "ordins" finds "Orders · Insights". */
export function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  for (const char of n) {
    if (char === " ") continue;
    i = h.indexOf(char, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

/**
 * Rank a match so the obvious answer lands first.
 *
 * A subsequence match alone puts "Prescription rejection reasons" above
 * "Products" for the query "pro", because both match and the list is in nav
 * order. Prefix and word-start hits are what people expect at the top.
 */
export function score(entry: Entry, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const title = entry.title.toLowerCase();

  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.split(/[\s·]+/).some((word) => word.startsWith(q))) return 2;
  if (title.includes(q)) return 3;
  if (entry.group.toLowerCase().includes(q)) return 4;
  return 5;
}

/**
 * Filter and rank in one pass, capped.
 *
 * The cap is not cosmetic: past roughly forty rows the list stops being
 * scannable, and a query matching everything is a query still being typed.
 */
export function searchEntries(
  entries: readonly Entry[],
  query: string,
  limit = 40,
): Entry[] {
  const q = query.trim();
  return entries
    .filter((e) => matches(`${e.group} ${e.title}`, q))
    .map((e) => ({ entry: e, rank: score(e, q) }))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.entry)
    .slice(0, limit);
}
