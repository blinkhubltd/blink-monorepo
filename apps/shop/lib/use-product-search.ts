import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import {
  clearRecentSearches,
  normaliseTerm,
  readRecentSearches,
  saveRecentSearches,
  withRecentSearch,
} from "./search-history";

/** How long the committed term lags the typed one. */
const DEBOUNCE_MS = 350;

/** The shortest term worth a round trip. */
const MIN_TERM_LENGTH = 2;

/**
 * Product search: the typed/committed split, the query, and the recent list.
 *
 * ── Why this is a hook and not just the screen's body ─────────────────────
 *
 * The search UI exists in two places — the full screen, and the field in the
 * catalogue header — and the app this replaces is a cautionary tale about
 * exactly that. It had three overlapping search components (`SearchHeader`,
 * `SimplifiedSearchHeader`, `SearchInput`) with the term living in the home
 * screen's state and threaded back down; `SimplifiedSearchHeader` took eleven
 * props, six of them search-state callbacks. That prop list was the bug.
 *
 * So there is one implementation of the debounce, the minimum term length, the
 * coverage query and the "remember it only if it returned something" rule, and
 * any number of renderers on top of it. A second renderer is a call to this
 * hook, never a copy of these rules.
 *
 * ── Why it is debounced ──────────────────────────────────────────────────
 *
 * `useQuery` re-subscribes whenever its arguments change, so binding it straight
 * to the input opens one Convex subscription per keystroke. The box stays
 * instant; only `committed` lags.
 *
 * ── Why the query is coverage-aware ──────────────────────────────────────
 *
 * `products.searchProductsAutocomplete` filters status and stops there, so a
 * customer could find something stocked only by a shop well outside its own
 * delivery radius, add it, and discover at checkout that nobody can bring it —
 * which would make the coverage rule the browse flow enforces decorative,
 * because search reaches around it. `catalog.searchProductsByCoverage` applies
 * the same rule. It needs a location for that, which is why `point` is required
 * rather than optional: with no location there is no correct answer, and the
 * caller has to say so in its own UI.
 */
export function useProductSearch({
  point,
  initialTerm = "",
}: {
  point: { lat: number; lng: number } | null;
  /** Seeds both terms, for arriving at the screen with `?q=` already set. */
  initialTerm?: string;
}) {
  const seed = normaliseTerm(initialTerm);
  const [typed, setTyped] = useState(seed);
  const [committed, setCommitted] = useState(
    seed.length >= MIN_TERM_LENGTH ? seed : "",
  );
  const [recent, setRecent] = useState<string[]>([]);

  // Read once on mount. Storage is synchronous, so there is no loading state
  // and no flash of an empty list.
  useEffect(() => setRecent(readRecentSearches()), []);

  useEffect(() => {
    const trimmed = normaliseTerm(typed);
    // One letter matches most of the catalogue and reads as noise.
    const next = trimmed.length >= MIN_TERM_LENGTH ? trimmed : "";
    if (next === committed) return;
    const timer = setTimeout(() => setCommitted(next), DEBOUNCE_MS);
    // Stored and cleared: without this the pending timer can land after the
    // component is gone, or after a later keystroke has already superseded it.
    return () => clearTimeout(timer);
  }, [typed, committed]);

  const results = useQuery(
    api.data.catalog.searchProductsByCoverage,
    committed && point
      ? { term: committed, lat: point.lat, lng: point.lng }
      : "skip",
  );

  /** Remember a term only once it has actually returned something. */
  useEffect(() => {
    if (!committed || !results || results.products.length === 0) return;
    setRecent((current) => {
      const next = withRecentSearch(current, committed);
      saveRecentSearches(next);
      return next;
    });
  }, [committed, results]);

  /** Commit immediately, for the keyboard's Search key. */
  const submit = useCallback(() => {
    setCommitted(normaliseTerm(typed));
  }, [typed]);

  /** Pick a stored term: both states move together, with no debounce. */
  const pick = useCallback((term: string) => {
    setTyped(term);
    setCommitted(term);
  }, []);

  const clear = useCallback(() => {
    setTyped("");
    setCommitted("");
  }, []);

  const forgetRecent = useCallback(() => {
    clearRecentSearches();
    setRecent([]);
  }, []);

  return {
    typed,
    setTyped,
    committed,
    /** `undefined` while in flight; `"skip"`ped queries also read undefined. */
    results,
    recent,
    submit,
    pick,
    clear,
    forgetRecent,
    /** Whether a term is committed — i.e. whether to show results at all. */
    searching: committed.length > 0,
  };
}
