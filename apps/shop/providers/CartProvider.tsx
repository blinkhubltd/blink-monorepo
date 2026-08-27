import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { StorageKeys, getJSON, setJSON } from "../lib/storage";

/**
 * The basket, for guests and signed-in customers alike.
 *
 * ── One interface, so screens never branch on auth ────────────────────────
 *
 * Signed in, the basket lives in Convex. Signed out, it lives on the device.
 * Both are behind the same `add / increment / decrement / remove / clear`
 * surface, which is what lets the product card, the cart screen and the product
 * detail bar each have one code path instead of two.
 *
 * ── Ids and quantities only. Never prices. ────────────────────────────────
 *
 * The device stores `{ product, quantity }` and nothing else; names, prices,
 * images and stock come from `catalog.productsByIds` on every render. A basket
 * that remembers last week's price is a pricing dispute waiting to happen, and
 * one that remembers stock will happily let someone check out an item that sold
 * out days ago.
 *
 * ── Why the guest cart is not keyed by a "guest id" ───────────────────────
 *
 * blink-ecommerce generated a `guest_cart_id` into AsyncStorage, and it keyed
 * nothing at all — `mergeGuestCartOnSignIn()` only deleted it. There is no
 * server-side guest basket to point at, so the id was pure ceremony. Dropped.
 *
 * ── The merge is guarded twice ────────────────────────────────────────────
 *
 * A Clerk token refresh can flip `isSignedIn` more than once in a session. An
 * unguarded merge on that transition adds the local basket to the server basket
 * repeatedly, and the customer sees three of something they added once.
 */

export type CartLine = { product: Id<"products">; quantity: number };

type CartState = {
  lines: CartLine[];
  /** Resolved product data for the lines. Empty while in flight. */
  items: Array<{
    product: Id<"products">;
    quantity: number;
    name: string;
    price: number;
    imageUrl: string | null;
    /** Active and in stock. Decided server-side so cart and checkout agree. */
    isPurchasable: boolean;
    /** What the shop actually has, for capping the stepper. */
    available: number;
    requiresPrescription: boolean;
  }>;
  count: number;
  subtotal: number;
  isGuest: boolean;
  loading: boolean;
  quantityOf: (productId: Id<"products">) => number;
  add: (productId: Id<"products">, quantity?: number) => void;
  increment: (productId: Id<"products">) => void;
  decrement: (productId: Id<"products">) => void;
  remove: (productId: Id<"products">) => void;
  clear: () => void;
};

const CartContext = createContext<CartState | null>(null);

function readLocal(): CartLine[] {
  const stored = getJSON<CartLine[]>(StorageKeys.guestCart, []);
  return Array.isArray(stored)
    ? stored.filter(
        (l) =>
          !!l &&
          typeof l.product === "string" &&
          typeof l.quantity === "number" &&
          l.quantity > 0,
      )
    : [];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();

  // Synchronous restore: the basket badge must be correct on the first frame,
  // not one frame late.
  const [localLines, setLocalLines] = useState<CartLine[]>(() => readLocal());

  const serverCart = useQuery(
    api.data.cart.getMyCart,
    isSignedIn ? {} : "skip",
  );
  const setServerLine = useMutation(api.data.cart.setMyCartLine);
  const clearServer = useMutation(api.data.cart.clearMyCart);
  const mergeCart = useMutation(api.data.cart.mergeIntoMyCart);

  const isGuest = !isSignedIn;

  const lines: CartLine[] = useMemo(() => {
    if (isGuest) return localLines;
    return (serverCart?.products ?? []) as CartLine[];
  }, [isGuest, localLines, serverCart]);

  // ── The sign-in merge ──
  const mergedRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || mergedRef.current) return;
    const pending = readLocal();
    if (pending.length === 0) {
      mergedRef.current = true;
      return;
    }
    // Latch BEFORE awaiting, so a second render during the round-trip cannot
    // start a second merge.
    mergedRef.current = true;
    void mergeCart({ items: pending })
      .then(() => {
        setJSON(StorageKeys.guestCart, []);
        setLocalLines([]);
      })
      .catch(() => {
        // Leave the local basket in place; it is better to merge late on the
        // next launch than to drop what the customer chose.
        mergedRef.current = false;
      });
  }, [isLoaded, isSignedIn, mergeCart]);

  const ids = useMemo(() => lines.map((l) => l.product), [lines]);
  const resolved = useQuery(
    api.data.catalog.productsByIds,
    ids.length > 0 ? { ids } : "skip",
  );

  const writeLocal = useCallback((next: CartLine[]) => {
    const cleaned = next.filter((l) => l.quantity > 0);
    setLocalLines(cleaned);
    setJSON(StorageKeys.guestCart, cleaned);
  }, []);

  const setQuantity = useCallback(
    (productId: Id<"products">, quantity: number) => {
      if (isGuest) {
        const existing = localLines.find((l) => l.product === productId);
        if (!existing) {
          if (quantity > 0)
            writeLocal([...localLines, { product: productId, quantity }]);
          return;
        }
        writeLocal(
          localLines.map((l) =>
            l.product === productId ? { ...l, quantity } : l,
          ),
        );
        return;
      }
      // Identity comes from the auth token server-side, never from an argument.
      void setServerLine({ productId, quantity });
    },
    [isGuest, localLines, writeLocal, setServerLine],
  );

  const quantityOf = useCallback(
    (productId: Id<"products">) =>
      lines.find((l) => l.product === productId)?.quantity ?? 0,
    [lines],
  );

  const items = useMemo(() => {
    const byId = new Map((resolved ?? []).map((p) => [p._id as string, p]));
    return lines.flatMap((line) => {
      const product = byId.get(line.product);
      // A line whose product no longer resolves (deleted, or an id from an
      // older install) is dropped from display rather than rendered blank.
      if (!product) return [];
      return [
        {
          product: line.product,
          quantity: line.quantity,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          isPurchasable: product.isPurchasable,
          available: product.quantity,
          requiresPrescription: product.requires_prescription,
        },
      ];
    });
  }, [lines, resolved]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      items,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      // Only purchasable lines count toward the total, so the figure on the
      // basket matches what checkout will actually charge for.
      subtotal: items
        .filter((i) => i.isPurchasable)
        .reduce((sum, i) => sum + i.price * i.quantity, 0),
      isGuest,
      loading: ids.length > 0 && resolved === undefined,
      quantityOf,
      add: (productId, quantity = 1) =>
        setQuantity(productId, quantityOf(productId) + quantity),
      increment: (productId) =>
        setQuantity(productId, quantityOf(productId) + 1),
      decrement: (productId) =>
        setQuantity(productId, Math.max(0, quantityOf(productId) - 1)),
      remove: (productId) => setQuantity(productId, 0),
      clear: () => {
        if (isGuest) writeLocal([]);
        else void clearServer({});
      },
    }),
    [
      lines,
      items,
      isGuest,
      ids.length,
      resolved,
      quantityOf,
      setQuantity,
      writeLocal,
      clearServer,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
