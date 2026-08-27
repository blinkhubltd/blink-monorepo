import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import type { ProductForCard } from "../components/product-card";

/**
 * Accumulating pages from an offset-paginated query.
 *
 * ── Why this hook exists ──────────────────────────────────────────────────
 *
 * `productsInCategoryTreeByCoverage` is offset-paginated, so each result is one
 * page — not the list so far. Feeding `result.products` straight into a list and
 * bumping the offset on `onEndReached` therefore *replaces* the grid with page 2
 * instead of extending it. It looks like the catalogue is losing products as you
 * scroll, and it is the kind of bug that is obvious on a device and invisible in
 * a type-check.
 *
 * So pages are accumulated here, keyed by offset, and flattened in order.
 *
 * ── Resetting ─────────────────────────────────────────────────────────────
 *
 * Any change to the *scope* of the listing — a different category, a different
 * level-3 filter, a different location — invalidates every accumulated page.
 * The scope is reduced to a single key string; when it changes, the accumulator
 * is dropped. Getting this wrong is how a customer switching category ends up
 * with the previous category's products still in the grid.
 */

type Result = {
  products: ProductForCard[];
  /** True only while the FIRST page is in flight. Later pages append quietly. */
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** No vendor covers this point at all — distinct from "no products". */
  coverageEmpty: boolean;
  total: number | null;
  totalIsExact: boolean;
  loadMore: () => void;
};

export function usePagedProducts({
  categoryId,
  l3CategoryId,
  point,
  pageSize = 20,
}: {
  categoryId: Id<"categories"> | null;
  l3CategoryId?: Id<"categories">;
  point: { lat: number; lng: number } | null;
  pageSize?: number;
}): Result {
  // Rounded to ~11 m. Raw GPS jitter would otherwise change the scope key on
  // almost every reading and reset paging under the customer's thumb.
  const scopeKey = [
    categoryId ?? "-",
    l3CategoryId ?? "-",
    point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : "-",
  ].join("|");

  const [offset, setOffset] = useState(0);
  const [pages, setPages] = useState<Record<number, ProductForCard[]>>({});
  const scopeRef = useRef(scopeKey);

  // Reset synchronously during render when the scope changes, rather than in an
  // effect. An effect runs *after* the first paint, so the stale grid would be
  // visible for a frame — which reads as the wrong category flashing up.
  if (scopeRef.current !== scopeKey) {
    scopeRef.current = scopeKey;
    if (offset !== 0) setOffset(0);
    if (Object.keys(pages).length > 0) setPages({});
  }

  const args =
    categoryId && point
      ? {
          categoryId,
          lat: point.lat,
          lng: point.lng,
          l3CategoryId,
          limit: pageSize,
          offset,
        }
      : "skip";

  const result = useQuery(
    api.data.catalog.productsInCategoryTreeByCoverage,
    args as never,
  );

  useEffect(() => {
    if (!result) return;
    setPages((current) => {
      const existing = current[offset];
      const incoming = result.products as unknown as ProductForCard[];
      // Convex pushes updates when underlying data changes, so this can fire
      // repeatedly for the same offset. Skip when nothing actually differs, or
      // the state update loops.
      if (
        existing &&
        existing.length === incoming.length &&
        existing.every((p, i) => p._id === incoming[i]?._id)
      ) {
        return current;
      }
      return { ...current, [offset]: incoming };
    });
  }, [result, offset]);

  const products = useMemo(
    () =>
      Object.keys(pages)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((key) => pages[key] ?? []),
    [pages],
  );

  const loadedFirstPage = pages[0] !== undefined;

  return {
    products,
    // A skipped query also returns undefined, so "loading" is only true when
    // there is genuinely something in flight — otherwise a screen with no
    // location yet would spin forever instead of asking for one.
    loadingInitial: args !== "skip" && !loadedFirstPage,
    loadingMore: args !== "skip" && loadedFirstPage && result === undefined,
    hasMore: result?.hasMore ?? false,
    coverageEmpty: result?.coverageEmpty ?? false,
    total: pages[0] !== undefined ? (result?.total ?? null) : null,
    totalIsExact: result?.totalIsExact ?? true,
    loadMore: () => {
      if (result?.hasMore && result.nextOffset !== null) {
        setOffset(result.nextOffset);
      }
    },
  };
}
