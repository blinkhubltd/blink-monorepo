# Manual verification — `apps/shop`

Nothing in this app has been run on a device, a simulator, or the web. Typecheck,
tests and a clean `convex dev` push are compile-level proof only, so this list
exists to catch the things that only fail at runtime.

Work through it in order — the setup items gate everything below them.

```bash
pnpm --filter shop dev
```

Use a **dev client or an EAS build, never Expo Go** — push notifications do not
work there, and MMKV is a native module.

---

## 0. Before anything else

Two things are assumed by the code and cannot be verified from source. If either
is wrong, most of what follows fails in a confusing way.

- [ ] **A role named `Customer` exists with `is_default: true`** on the dev
      deployment. A customer's `users` row is created by the Clerk webhook and
      by nothing else, and it gets whichever role holds that flag. `ensureRoles`
      only claims it `if (!defaultTaken)`, so a pre-existing role holding it
      would silently capture every new signup.
- [ ] **The Clerk webhook is registered** at `/api/v1/webhooks/clerk` and
      `CLERK_WEBHOOK_SECRET` is set. Without it a signed-in customer has no
      `users` row — the app now says "setting up your account" instead of
      showing an empty basket, but it still cannot be used.
- [ ] `apps/shop/.env.local` exists (copy `.env.example`).

---

## 1. Refresh and routing — the reported bug

This is the reason the routes were restructured. Each item must return to the
**same screen**, not the home screen.

- [ ] Reload on `/` → top-level categories.
- [ ] Reload on `/c/<slug>` → that category's subcategories.
- [ ] Reload on `/c/<slug>/<subslug>` → that product grid.
- [ ] Reload on `/c/<slug>/<subslug>?t=<tertiary>` → **both pill selections
      still set**, and the level-2 pill scrolled into view rather than the list
      sitting at the first pill.
- [ ] Cold-open a deep link `https://blink.app/product/<id>` on a real device →
      the product, not the home screen.
- [ ] Tap the Shop tab while three levels deep → pops to categories. It must not
      reload or clear the browse state.
- [ ] Android hardware back from a product grid → subcategories → categories.

## 2. Loading is not "missing"

The failure mode these guard against is a spinner that never resolves, or a
"not found" shown during a normal load.

- [ ] Open a product id that does not exist → a not-found screen **with a
      working back button**, not an endless spinner.
- [ ] Hand-edit the URL to a level-2 slug that is not under the level-1 slug →
      not-found, not a blank grid.
- [ ] On a slow connection, the first paint of each screen shows skeletons at
      the same shape as the real content — nothing should jump when data lands.

## 3. Location and coverage

- [ ] Deny location permission → an explanation with a retry, not a spinner.
- [ ] Set a location outside every delivery radius → **"No shops deliver here
      yet"**, which is a different message from an empty aisle.
- [ ] A category with covering shops but no stock → **"No … available near
      you"** plus a way to change location. Confirm the two messages differ.

## 4. Basket and sign-in

- [ ] Add items while signed out. Force-quit the app. Relaunch → **the basket
      survives**. If it does not, MMKV has not linked (see §7).
- [ ] With a guest basket populated, sign in → items merge, and where the same
      product was in both baskets the quantity is the **larger** of the two, not
      the sum.
- [ ] Sign in a second time in the same session, or leave the app open long
      enough for a token refresh → the basket must **not** double.
- [ ] Add and remove lines while signed in → no red-box crash, and any failure
      shows a message rather than silently reverting.
- [ ] Sign out with items in the basket → no unhandled error in the console.
- [ ] A product that goes out of stock while in the basket → struck out,
      excluded from the total, still removable.
- [ ] The `+` on a line stops at available stock and says why.

## 5. Sign-in itself

- [ ] Enter a registered email → a code arrives, and six digits submit
      automatically without pressing a button.
- [ ] Paste a code with a space in it → still accepted.
- [ ] Let autofill enter the code → it must not fail as "incorrect" (that is the
      double-submit latch doing its job).
- [ ] Enter an **unregistered** email → offered "Create account", **not**
      "access denied".
- [ ] Wrong code → an error, and the same digits can be retried.
- [ ] Resend is disabled for 30s, then works.
- [ ] Close the modal mid-flow → back on the screen you started from, with the
      URL unchanged.
- [ ] Start checkout signed out → the sign-in modal appears **over** checkout,
      and after signing in you are still on checkout.

## 6. Money

The figures the basket shows must match what an order will be charged.

- [ ] Basket just **under** KES 2,000 from one shop → delivery 200.
- [ ] Basket at exactly **2,000** from one shop → delivery **free**.
- [ ] Basket under 2,000 across **two** shops → delivery **250**, not 400, and
      the basket explains the extra-shop charge.
- [ ] Basket over 2,000 across two shops → delivery **50** (base waived,
      pickup charge kept).
- [ ] The "spend X more for free delivery" line disappears once you qualify.
- [ ] Change `free_delivery_threshold` on the admin settings page → the basket
      reflects it without a rebuild.
- [ ] A guest basket shows "calculated at checkout" rather than a figure.

## 7. Native modules

These are the ones that cannot fail at compile time.

- [ ] **MMKV**: the guest basket survives a cold start (§4). If the console
      shows `[storage] MMKV unavailable`, the native module has not linked —
      the app still runs but forgets everything, which is exactly the silent
      failure the warning exists to prevent.
- [ ] **SVG**: any screen using an SVG asset renders. A transformer
      misconfiguration fails at bundle time, so this is pass/fail at launch.
- [ ] **Push**: a notification arrives with the app backgrounded, on a physical
      Android device. Requires `POST_NOTIFICATIONS`, which was merged forward
      from the deleted `app.json`.

## 8. Both colour schemes

Shop hardcoded light mode before, so dark mode is **new surface**, not a
regression check. Switch the device theme and check every screen touched:
categories, subcategories, product grid, product detail, basket, sign-in,
checkout gate.

- [ ] No unreadable text, no white-on-white card, no invisible border.

## 9. Security spot-checks

Worth confirming from a REST client rather than the app, since the app will
never exercise them.

- [ ] `POST` to `data/catalog` mutations, and to `data/products:createProduct`,
      unauthenticated → `Unauthorized`.
- [ ] `data/orders:generateDeliveryCode` and `checkDeliveryCode` are no longer
      in the public function list at all.
- [ ] `data/payment_finalization:finalizePaidOrders` unauthenticated →
      `Unauthorized`.

---

## Known not-done

- **Order placement.** Checkout gates and explains, but does not place an order.
  It needs the payments-quote work so the amount charged and the orders written
  cannot disagree.
- **Prescription upload** is checkout-only and unbuilt here.
- The finalisers still trust client-supplied `delivery_fee` / `total_amount`
  from an *authenticated* caller. Anonymous and cross-customer abuse is closed;
  a signed-in customer setting their own price is not, until the quote lands.
