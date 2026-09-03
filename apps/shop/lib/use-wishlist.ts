import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

/**
 * Saved items.
 *
 * ── Three states, not two ────────────────────────────────────────────────
 *
 * A heart has to distinguish saved, not-saved and don't-know-yet. The old app
 * conflated the last two: `isProductInWishListByClerkId` returns `undefined`
 * while in flight, which rendered as *unsaved*, so a saved product flashed empty
 * on every mount and a tap in that window unsaved it. `loaded` is exposed so the
 * heart can stay neutral until the answer arrives.
 *
 * ── Signing in is asked for, never navigated to ──────────────────────────
 *
 * A guest tapping the heart gets `requiresSignIn`, which the screen renders as a
 * line with a button. Redirecting from a side effect is what produced the
 * refresh-to-home bug, and losing the product you were looking at to a sign-in
 * screen loses the sale too.
 */
export function useWishlist() {
  const { isSignedIn } = useAuth();

  const wishlist = useQuery(api.data.wishlist.getMyWishlist, {});
  const toggleItem = useMutation(api.data.wishlist.toggleMyWishlistItem);

  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic overlay, so the heart fills on tap rather than on round-trip.
  // Cleared implicitly: once the subscription updates, the two agree.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const savedIds = useMemo(
    () => new Set<string>(wishlist?.productIds ?? []),
    [wishlist],
  );

  const isSaved = useCallback(
    (productId: string) => pending[productId] ?? savedIds.has(productId),
    [pending, savedIds],
  );

  const toggle = useCallback(
    async (productId: Id<"products">) => {
      if (!isSignedIn) {
        setRequiresSignIn(true);
        return;
      }
      setError(null);
      const next = !isSaved(productId);
      setPending((current) => ({ ...current, [productId]: next }));
      try {
        const result = await toggleItem({ productId });
        // Trust the server's answer over the guess — a cap rejection means the
        // heart must go back.
        setPending((current) => ({
          ...current,
          [productId]: result.inWishlist,
        }));
      } catch (caught) {
        setPending((current) => {
          const { [productId]: _dropped, ...rest } = current;
          return rest;
        });
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not save that just now.",
        );
      }
    },
    [isSaved, isSignedIn, toggleItem],
  );

  return {
    /** False while the answer is in flight: the heart stays neutral, not empty. */
    loaded: wishlist !== undefined,
    savedIds,
    count: wishlist?.productIds.length ?? 0,
    atCapacity: wishlist?.atCapacity ?? false,
    isSaved,
    toggle,
    requiresSignIn,
    dismissSignIn: () => setRequiresSignIn(false),
    error,
    dismissError: () => setError(null),
  };
}
