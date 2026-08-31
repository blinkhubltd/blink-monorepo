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

## 9. Checkout and the order total

The figure on screen must equal the figure charged and the figures written to the
orders. That equality is now enforced server-side, so these check it holds.

- [ ] One-shop basket under 2,000: subtotal + 200 = total. The VAT lines
      decompose the subtotal (ex-VAT + VAT = subtotal); they do not add to it.
- [ ] One-shop basket over 2,000: delivery shows Free, and a "you saved KES 200"
      line appears.
- [ ] **Two-shop basket:** the summary groups lines by shop and says "2
      deliveries". Delivery is 250, not 400.
- [ ] Place a **pay-on-delivery** order for a two-shop basket. Then confirm:
      two orders exist; each order's `delivery_fee` is its apportioned share;
      **the two fees sum to exactly the fee shown at checkout**; and the two
      `total_amount`s sum to the total shown.
- [ ] The confirmation screen lists both deliveries and the basket total.
- [ ] The basket is empty afterwards.
- [ ] Double-tap "Place order" — exactly one set of orders is created.
- [ ] Change a product's price in admin while sitting on checkout, then place the
      order — it refuses and says the price changed, rather than charging either
      figure.
- [ ] Remove the delivery address, or use an account with none — the button is
      disabled and the reason is listed.
- [ ] Deny location permission, then check the receiver section still appears and
      explains itself rather than vanishing.
- [ ] An address ~200m from where you are: receiver name and phone are required,
      and the distance is shown.
- [ ] Put an item needing a prescription in the basket: checkout blocks and says
      why.
- [ ] Choose "Pay now": it states that the card step is not in this build and
      that nothing was charged. Nothing should be charged.

## 10. Orders, tracking and profile

- [ ] Place an order, then open the Orders tab — it appears, and a multi-shop
      basket shows as ONE card saying "N deliveries", not N separate cards.
- [ ] A live order sorts above an older delivered one, regardless of date.
- [ ] "Track" appears only while something is still coming.
- [ ] Tracking shows a five-step rail with the current step marked. Cancel an
      order in admin and reopen tracking — no rail, just the status.
- [ ] **Before a rider is assigned**, tracking shows no rider name, no phone and
      no position.
- [ ] **Once the order is Out for Delivery**, the rider's first name appears, and
      a call button. Confirm it is a FIRST name only, and that no surname,
      rider id or rider address is shown anywhere.
- [ ] Profile shows your email, and the Terms/Privacy rows open the WEBSITE in
      the in-app browser, then return you to Profile on close. Confirm both
      URLs resolve to a published document rather than a 404 - the paths live in
      `lib/legal.ts` and have never been checked against the live site.
- [ ] Checkout shows the agreement line above the pay button, and both links
      open. Placing an order inserts a `legal_acceptances` row whose versions
      match `platform_settings` - not `v1.0` unless that is genuinely the
      setting. Bump `terms_version` in admin, place another order, and confirm
      the new row carries the new version.
- [ ] Sign out from Profile — no unhandled error, and the guest basket behaves
      as in §4.
- [ ] Open `/order/<someone else's order id>` while signed in → not found, and
      it must NOT confirm the order exists.

## 11. Security spot-checks

Worth confirming from a REST client rather than the app, since the app will
never exercise them.

- [ ] `POST` to `data/catalog` mutations, and to `data/products:createProduct`,
      unauthenticated → `Unauthorized`.
- [ ] `data/orders:generateDeliveryCode` and `checkDeliveryCode` are no longer
      in the public function list at all.
- [ ] Neither are `data/tracking:getRiderLocation`, `getShipmentTracking`,
      `getDeliveryTimeline`, `getEstimatedDeliveryTime` or `getActiveDeliveries`
      — each previously returned rider or customer rows, or live rider GPS, to
      anyone holding a shipment id.
- [ ] `data/tracking:updateRiderLocation` unauthenticated → `Unauthorized`, and
      it no longer accepts a `riderId`.
- [ ] `data/payment_finalization:finalizePaidOrders` unauthenticated →
      `Unauthorized`.

## 12. Addresses

- [ ] Profile → Delivery addresses. With none saved, the empty state explains
      rather than showing an empty box.
- [ ] Add one. The map's pin stays centred while the map moves under it, and the
      line beside it says how many shops reach the spot — before you submit.
- [ ] Drag the pin somewhere no shop covers → the reason is stated and Save is
      blocked. Confirm the message names coverage, not a validation failure.
- [ ] While the coverage check is in flight it must NOT say "no shop delivers
      here". A pan should never flash that message.
- [ ] The FIRST address saved is default even if you left the switch off.
- [ ] Save a second address named the same as the first (try lower case, and try
      trailing spaces). The button must read "Replace <name>" and explain, and
      afterwards there must be ONE entry, not two that look identical.
- [ ] Delete the default. Another address becomes default — the oldest — rather
      than the book being left with none.
- [ ] Delete confirms in the row itself. On web too, where `Alert.alert` does
      nothing.
- [ ] Reload on `/addresses/new?label=Home` — it returns to the same edit with
      the fields filled, not a blank Add form.
- [ ] Check out with no saved address: checkout offers "Add an address" and
      reaching it works. Before this existed it told you to use your profile,
      where there was no such screen.
- [ ] On web, the picker says it is a stand-in and uses the browser location
      rather than rendering an empty box.

## 13. Saved items

- [ ] Tap the heart on a card while signed OUT → a line offering sign-in appears
      on the same screen. You must not be navigated away, and the basket and
      scroll position must survive.
- [ ] Signed in, tap the heart: it fills immediately. Reopen the screen — it is
      still filled. Watch for a flash of empty on mount; that was the old bug.
- [ ] Profile → Saved items lists them with current prices. Change a price in
      admin and reopen — the new price shows, because nothing is remembered from
      when it was saved.
- [ ] Save something, then take it out of stock in admin. It stays in the list,
      marked unbuyable — not hidden, which looks like the app lost it.
- [ ] Archive a saved product in admin. The footer says how many saved items are
      no longer in the catalogue rather than the count silently disagreeing with
      the list.
- [ ] Unsave from the saved screen: the item leaves and the count drops.

Security, from a REST client:

- [ ] `data/wishlist:toggleMyWishlistItem` unauthenticated → `Unauthorized`.
- [ ] `data/addresses:saveMyAddress`, `setMyDefaultAddress` and
      `deleteMyAddress` unauthenticated → `Unauthorized`, and none of the three
      accepts a `clerkId` or `user_id`.
- [ ] `data/legal_acceptances:recordAcceptance` accepts no version argument.

---

## Known not-done

- **Paystack.** Pay-on-delivery is complete end to end. The card step needs the
  native SDK on a real device and is not faked — the quote is already recorded
  and the amount fixed, so it slots in without touching pricing.
- **Prescription upload.** Checkout detects that a basket needs one and blocks,
  but the upload flow itself is not built here.
- **Clearance baskets** remain a separate flow and are not part of this
  checkout.
