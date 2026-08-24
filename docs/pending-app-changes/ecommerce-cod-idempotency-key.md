# Pending app change: send `idempotency_key` from the COD checkout

**Status: prepared, NOT applied. Applying it before the backend cutover breaks production.**

`finalizePayOnDeliveryOrders` and `finalizePayOnDeliveryClearanceOrders` now
require `idempotency_key` on `doting-bandicoot-348`. The app must send one — but
not yet.

## Why this is not applied

`blink-ecommerce` talks to `adventurous-hound-19`, not the monorepo deployment.
That deployment's finaliser accepts only three arguments:

```
finalizePayOnDeliveryOrders   args: orders, payment_method, user_id
```

Convex validates arguments strictly. Sending a fourth is rejected with
`ArgumentValidationError`, so applying this patch today makes **every
cash-on-delivery checkout fail in production**. It is not a graceful
degradation — the mutation never runs.

## Correct sequence

1. Port `blink-ecommerce` into `apps/ecommerce` and repoint it at the monorepo
   deployment. The backend there already requires the key.
2. Apply this patch **in the same release** as that repoint.
3. Only then delete `adventurous-hound-19` as a target.

If the key is ever needed on the live deployment before the port, it has to go
out as optional there first, then required — the two-step every required-argument
addition needs. That was the original shape of this change, and it was made
required only because the monorepo deployment has no consumers yet.

## The patch

`app/checkout.tsx`. `useMemo` is already imported (line 1).

### 1. Derive the key from the prepared cart

Immediately after the `preparedOrders` state declaration (line 45):

```tsx
const [preparedOrders, setPreparedOrders] = useState<any[] | null>(null);

// Stable de-duplication key for pay-on-delivery finalisation.
//
// Tied to the prepared cart rather than to the button press: a failed submit
// leaves `preparedOrders` untouched, so a retry reuses the same key and the
// server returns the orders it already created instead of making a second set.
// A genuinely new checkout replaces `preparedOrders` and therefore gets a new
// key.
//
// Must NOT be generated inside the onPress handler — that produces a fresh key
// per tap, which is exactly the duplicate-order case this prevents.
const codIdempotencyKey = useMemo(
  () =>
    preparedOrders
      ? `cod_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      : null,
  [preparedOrders],
);
```

### 2. Send it

At the `finalizePayOnDeliveryOrders` call (line ~1307):

```diff
                         setFinalizing(true);
                         try {
+                          if (!codIdempotencyKey) {
+                            throw new Error(
+                              "Missing idempotency key — orders not prepared",
+                            );
+                          }
                           await finalizePayOnDeliveryOrders({
                             user_id: userIdConvex,
                             payment_method: "Cash on Delivery",
+                            idempotency_key: codIdempotencyKey,
                             orders: preparedOrders.map((grp) => ({
                               order: {
                                 ...grp.order,
                                 payment_mode: "pay_on_delivery",
                               },
                               items: grp.items,
                             })),
                           });
```

The guard is belt-and-braces: `preparedOrders` is already checked before this
block is reachable, so `codIdempotencyKey` cannot be null in practice. It exists
so a future refactor that loosens that check fails loudly rather than sending
`undefined` into a required field.

## Do not reuse `generatePaymentReference`

`hooks/reference.ts` exports:

```ts
export const generatePaymentReference = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `PSK_${timestamp}_${randomStr}`;
};
```

It looks like the right thing and is not. It returns a **new** value on every
call, so calling it at submit time defeats the purpose entirely — each retry gets
a different key and the server sees each as a new checkout. The value has to be
generated once and held; that is the whole point of anchoring it to
`preparedOrders`.

The `cod_` prefix is deliberate too: these keys are not Paystack references and
should not be mistaken for them in logs or in the `orders` table.

## Note on cart clearing

The server-side cart clear added alongside this is **not** fixing a
user-visible bug — `app/checkout.tsx:1318` already calls
`clearCart({ clerkId })` after the finaliser returns. An earlier report that the
customer's cart stayed full was overstated.

The server-side clear still matters: it closes the window where the finaliser
succeeds but the client dies before its follow-up call, which would leave real
orders alongside a full cart. And it makes the four finalisation paths
consistent, which is what made the omission look like a bug in the first place.

## Clearance

`finalizePayOnDeliveryClearanceOrders` also requires the key now, but has **zero
callers in any app** — clearance pay-on-delivery is unreachable. Nothing to patch
until that flow is built. `app/clearance-checkout.tsx:116` calls
`finalizePaidClearanceOrders`, which is a prepaid path and unaffected.
