import { StorageKeys, getJSON, setJSON } from "./storage";

/**
 * Recent search terms.
 *
 * A convenience, and treated as one: it lives in device storage, losing it costs
 * nothing, and nothing else depends on it. Kept out of the account deliberately —
 * a searched term is a more revealing record than an order, and syncing it to a
 * profile makes it something to protect.
 */

const MAX_TERMS = 8;

/** Longest term kept, so a pasted paragraph cannot become a stored entry. */
const MAX_LENGTH = 60;

export function normaliseTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
}

export function readRecentSearches(): string[] {
  const stored = getJSON<unknown>(StorageKeys.recentSearches, []);
  // Validated rather than trusted: this is parsed device state, and a shape
  // change in a past version must not crash the screen that reads it.
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((entry): entry is string => typeof entry === "string")
    .map(normaliseTerm)
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_TERMS);
}

/**
 * Put a term at the front, dropping any case-insensitive duplicate.
 *
 * Pure, returning the new list, so the caller controls when it is written and
 * the ordering can be tested without touching storage.
 */
export function withRecentSearch(
  existing: readonly string[],
  term: string,
): string[] {
  const normalised = normaliseTerm(term);
  if (!normalised) return [...existing];
  const lower = normalised.toLowerCase();
  return [
    normalised,
    ...existing.filter((entry) => entry.toLowerCase() !== lower),
  ].slice(0, MAX_TERMS);
}

export function saveRecentSearches(terms: readonly string[]): void {
  setJSON(StorageKeys.recentSearches, terms.slice(0, MAX_TERMS));
}

export function clearRecentSearches(): void {
  setJSON(StorageKeys.recentSearches, []);
}
