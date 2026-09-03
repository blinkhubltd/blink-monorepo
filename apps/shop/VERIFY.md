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
## 14. Search

- [ ] Run `data/products:backfillProductsSearchText` once before testing. Rows
      created before the search field existed have no `searchText`, so they are
      invisible to search however well they match.
- [ ] Type one letter: nothing is searched. Two: results appear after a beat.
      Watch the network panel — one request per settled term, not per keystroke.
- [ ] A product stocked ONLY by a shop that cannot reach you must not appear.
      This is the point of the query; the old autocomplete had no coverage
      filter at all.
- [ ] Set a location outside every radius and search → "no shops deliver here",
      not "nothing found".
- [ ] Search something absurd → "Nothing for X", distinct from both above.
- [ ] A term that returned results appears under Recent; one that returned
      nothing does not. Tapping a recent term re-runs it.
- [ ] Clear removes them, and they stay gone after a force-quit.
- [ ] The keyboard's Search key commits immediately rather than waiting.
## 15. Notifications

- [ ] The bell in the catalogue header shows a dot only when something is
      unread, and the basket icon now carries a count — check both headers, the
      catalogue one and the pushed-screen one.
- [ ] Place an order, then have admin move it along. The status notification
      arrives and tapping it opens THAT order. The backend still writes
      `/order-details/<id>`, a path this app does not have, so a regression here
      shows up as a not-found screen.
- [ ] Tapping an unread one clears its dot. Mark all as read clears the rest.
- [ ] A notification with no order and no known route is not pressable, and
      offers a delete instead of a chevron.

Security, from a REST client - this is the one to actually try:

- [ ] `data/user_notifications:getUserNotifications` is GONE from the public
      function list. It took `userId` as an argument, and delivery-code
      notifications carry the six-digit handover code in their message and in
      `data.deliveryCode` - so it was a second door onto the secret that
      `generateDeliveryCode` was closed for.
- [ ] `createDeliveryCodeNotification` and the other six creators are gone too.
      Anyone could previously write a notification titled "Your Delivery Code"
      into any customer's feed, with a phone number of their choosing.
- [ ] `getMyNotifications` unauthenticated returns an empty list, not an error
      and not somebody's feed.
- [ ] Rider notifications still work - the rider app moved onto the same
      auth-derived queries in this change.
## 16. Your details, and rating a delivery

- [ ] Profile → tap your name. Change the first name, save: the header updates.
      The name goes to Clerk and the phone to Convex, and they save separately -
      confirm a failure in one does not report as a failure of both.
- [ ] Save an invalid phone ("abc", "123") → refused with a reason. The server
      applies the same rule, so this cannot be bypassed by a modified client.
- [ ] Email is shown and not editable, with an explanation.
- [ ] An undelivered order offers Track, not Rate.
- [ ] Mark an order Delivered in admin. The order screen offers Rate; five
      stars sends, and the screen then says you rated it.
- [ ] Reopen it: the stars show your score and cannot be changed. Rating twice
      is refused rather than overwriting.
- [ ] The rating screen shows the rider's FIRST name only, and no phone number.

Security, from a REST client:

- [ ] `data/ratings:submitRiderRating` and `getRiderRatingContext` are gone from
      the public function list. The first let anyone set a rider's score with
      only an order id; the second returned the rider's full name and phone to
      the same caller.
- [ ] `rateMyDelivery` on an order you do not own → "Order not found", the same
      answer as an id that does not exist.
## 17. Clearance

Seed at least two clearance listings from two different shops, one with an
`expiry_date` and one without, and one with `quantity: 1`.

- [ ] The Shop tab shows a Clearance entry above the categories. It opens
      `/clearance`.
- [ ] Deals show the discount, the real strike-through price, and the DATE. The
      catalogue cards deliberately show no strike-through, because those prices
      are stubs - confirm the difference is intact.
- [ ] A listing with an `expiry_date` reads "Use within N days"; one without
      reads "Offer ends in N days". These are different dates and must not be
      conflated - the first is when the food goes off.
- [ ] Set an expiry two days out: the line turns urgent (red).
- [ ] Add a deal. The clearance basket bar appears. Confirm the CATALOGUE basket
      count does not change - they are separate baskets, by design.
- [ ] Add 1 of a listing with 1 in stock, then try to add more: the stepper's
      plus is disabled at stock, and the server refuses if bypassed.
- [ ] Expire a listing in admin (`display_end_date` in the past) while it is in
      your basket. The basket keeps the line, marked "This deal has ended", and
      the total excludes it. It must not silently vanish, and the total must not
      include it.
- [ ] Sold-out and ended read differently.

Money - this is the part worth checking carefully:

- [ ] A clearance basket over the free-delivery threshold is STILL charged
      delivery. Free delivery does not apply to discounted stock, and the
      checkout says so. If this ever shows free, the waiver has leaked.
- [ ] A two-shop clearance basket: fee is base + 50, not base x 2, and it
      produces TWO orders. The old `createClearanceOrder` wrote one order for
      the whole basket while charging for two pickups.
- [ ] The two orders' delivery fees sum exactly to the basket fee.
- [ ] Place a pay-on-delivery clearance order and confirm in admin: both orders
      carry `is_clearance: true`, their items are in `clearance_order_items`
      with the original price and discount as shown, and the listing stock has
      dropped.
- [ ] Double-tap Place order: one set of orders, not two.

Security, from a REST client:

- [ ] `data/clearance_cart:getCart`, `addToCart`, `updateQuantity`,
      `removeFromCart` and `clearCart` all still exist but each takes a
      `user_id` - confirm the app calls none of them. The `*My*` versions take
      no identity at all.
- [ ] `data/orders:createClearanceOrder` is gone from the public function list.
- [ ] `beginClearanceCheckout` with an `expectedTotal` that does not match is
      refused, and nothing is charged.
## 18. Agents and referrals

**Read this section before testing.** The hole it closes is the most serious
found in this port: `incrementInstallCount` and `incrementRegistrationCount`
were public, unauthenticated mutations that credited an agent's balance, keyed
only on the referral code printed on the agent's own QR poster. Anyone who could
read a poster could call either in a loop and mint earnings, withdrawable
through the Paystack payout path.

Security, from a REST client - do these first:

- [ ] `data/marketing:incrementInstallCount` and `incrementRegistrationCount`
      are GONE from the public function list.
- [ ] `data/marketing:getAgentByUser`, `getAgentEarnings`, `getAgentStats` and
      `data/agent_payment_requests:getAgentPaymentRequests` are gone too. Each
      took an id with no auth; the first returned the agent's M-Pesa number and
      Paystack recipient code.
- [ ] `attributeMyRegistration` unauthenticated → `Unauthorized`.
- [ ] Call `attributeMyRegistration` twice with a valid code as the same signed-in
      customer. The agent's registration count and balance move ONCE. Check the
      `users` row now carries `referred_by_agent_id`.
- [ ] Call it as the agent themselves → refused, no credit.
- [ ] Call it with a code that does not exist → the same shape as a valid call,
      with nothing credited. It must not reveal whether the code exists.

The screens:

- [ ] As a non-agent customer, Profile shows a Referral code row and NO agent
      row. Confirm the agent row is hidden, not shown-and-empty.
- [ ] As an agent (assign an agent record in admin), Profile shows the agent row
      and it opens `/agent`.
- [ ] The dashboard shows Available to withdraw, and when a request is open, the
      earned-and-unpaid figure with the difference named. Confirm they differ.
- [ ] Nothing on the screen or in the network response contains the Paystack
      recipient code or the M-Pesa number. Check the response body, not just the
      UI.
- [ ] With payouts not enabled, the request form explains rather than failing on
      submit.
- [ ] Request a payout for exactly the available balance: accepted. For one
      shilling more: refused with a reason before submitting.
- [ ] Open a second request while one is pending → refused.
- [ ] Set `agent_payout_days` to a day that is not today → the request is
      refused by the server, and the screen shows that message. Then clear the
      setting to an empty string: payouts must work again, NOT be blocked
      forever (an empty setting used to mean no day was allowed).
- [ ] A rejected request shows the admin's rejection reason. The old dashboard
      never showed it.
## 19. Prescriptions

**The whole path was dead before this change.** Seven cross-module calls in
`prescriptions.ts` and `picker_assignment.ts` were strings cast through
`as any`, and every name was wrong - so no prescription was ever routed to a
picker and no picker was ever notified. The upload swallowed the failure and
returned success, so it looked like it worked. The same wrong reference sat in
`assignOrderToPicker`, so ORDER routing to pickers was broken too.

That means this section tests behaviour that has never run in production. Expect
surprises, and check the picker side as well as the customer side.

Setup: a product with `requires_prescription: true`, and at least one user with
the Picker role whose `picker_details.vendor_id` is that product's vendor and
whose `picker_details.status` is Active.

- [ ] Add the Rx product to your basket and open checkout. The Prescriptions
      section names the SHOP, and the pay button is blocked with a reason.
- [ ] Take a photo. It uploads, the badge becomes In review, and the button
      unblocks - a pending prescription does not block checkout, by design: the
      order is held for dispatch instead.
- [ ] In admin/picker, confirm a `picker_assignments` row was created for that
      prescription AND the assigned picker got a notification. This is the part
      that never worked.
- [ ] Deactivate every picker for that vendor and upload again: the screen says
      it was received but nobody is available to review it. It must NOT show
      plain success.
- [ ] Reject the prescription as a picker. Checkout blocks again with "not
      accepted", and the section offers a re-upload.
- [ ] Approve it. The badge becomes Approved.
- [ ] **Two chemists in one basket.** Add Rx products from two different
      vendors. Two rows appear. Approve ONE. Checkout must still block: an
      approval from one shop must not clear the other. This is the defect the
      old vendor-keyed query had.
- [ ] Upload a second document for a vendor that already has an APPROVED one.
      The new row must show In review, not instantly Approved - the old query
      returned the most recent for the vendor pair and auto-closed on the old
      approval.
- [ ] Cancel the photo picker: back to buttons, no spinner left running.
- [ ] Deny camera permission: an explanation, and the file option still works.

Security, from a REST client:

- [ ] `data/prescriptions:uploadMyPrescription` unauthenticated →
      `Unauthorized`, and it accepts no `clerkId`.
- [ ] `getMyPrescription` on somebody else's prescription id → null, the same
      answer as a missing one.
- [ ] `data/vendors:getVendorNames` returns ONLY `_id` and `name`. Confirm no
      commission, service radius, bank details or Paystack subaccount appear -
      this is the one vendor query a customer device may call.

---

## 20. Card and M-Pesa payment

**Setup, before any of this works.** Three things, all on the dev deployment:

```bash
npx convex env set PAYSTACK_SECRET_KEY sk_test_...
```

`EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...` in `apps/shop/.env`, and the
Paystack dashboard webhook pointed at the deployment's `/paystack/webhook`. Use
**test keys only** — a `sk_live_` here charges real cards.

If the secret key is missing, the app says so honestly rather than looking slow:
you get "We could not confirm the payment because this build is not configured
for payments". If the publishable key is missing, pay-now is not offered at all.
Both of those are worth seeing once deliberately.

**Check the amount first.** It is the one error that costs real money, and it is
one character wide.

1. Put a basket together, note the total, choose **Pay now**, and open the
   sheet. The figure Paystack shows must be the basket total — not 100× it. The
   SDK multiplies by 100 itself, so the app passes shillings; the old app had
   this right and a comment above it saying the opposite.

**The happy path.**

2. Complete a **card** payment with a Paystack test card. Expect: the button
   goes to "Confirming your payment…", then the order screen. Then check
   Convex: the `payments` row is `Successful`, and there is one `orders` row per
   vendor with `payment_status: "Paid"`, `payment_mode: "pay_now"`, a
   `delivery_code`, and `total_amount` matching the row's `quote.legs[n].total`.
   The sum of the orders' `delivery_fee` must equal the basket fee exactly.
3. The basket is empty afterwards, and only after the orders exist.

**The case the old app got wrong. This is the important one.**

4. Start a payment, complete it, and **force-quit the app before it returns** —
   swipe it away from the app switcher while the Paystack screen is still up, or
   immediately after paying. Then reopen.

   The order must exist. It is written by the webhook, from the quote and the
   address stored on the payment row at `beginCheckout`, with no involvement
   from the app at all. If it does not exist, the webhook is not reaching the
   deployment — check the Paystack dashboard's webhook log, not the app.

   This is the state the old checkout apologised for with a "We received your
   payment but order creation failed" alert and a Retry button.

5. **Background and return.** Pay, background the app, foreground it. One
   verification, one order set. Two order sets for one payment is the failure
   here — settlement is idempotent on the reference, so a webhook racing the
   returning app must produce one.

**M-Pesa, which is the slow one on purpose.**

6. Choose M-Pesa, enter a test number, and **take your time with the PIN** —
   over a minute. The old client gave up after two minutes of polling and told
   the customer it had failed while the money had in fact been collected. Expect
   either the order screen, or "Your payment is being confirmed. Your order will
   appear in Orders shortly" — and then the order actually appearing in Orders,
   put there by the webhook. That message must never read as a failure.

**Backing out, and pressing twice.**

7. Open the sheet and **cancel**. Expect "Payment cancelled. Your basket is
   unchanged", the basket intact, and the Pay button live again. Retry: it must
   not create a second `payments` row — the reference is reused.
8. **Double-tap Pay.** One sheet, one order set.
9. Pay, and while it says "Confirming…", try to tap Pay again. It must be
   disabled. The old screen left it live during settlement, so a second tap
   reopened the sheet on a reference already being charged.
10. Switch from Pay now to Pay on delivery and back, then place the order.
    Check the `orders` row's `payment_method` matches how you actually paid —
    switching mode drops the pending reference precisely so a card charge cannot
    land on a row stamped "Cash on Delivery".

**A declined card.**

11. Use Paystack's declined test card. Expect "The payment did not go through.
    Nothing has been charged", no orders written, and the basket intact.

**Clearance is pay-now only now.**

12. Open a clearance basket and go to checkout. There must be **no
    pay-on-delivery option anywhere** — the screen says clearance deals are paid
    now, and explains that stock is held only once payment clears.
13. Pay for a clearance basket. Check the orders carry `is_clearance: true`,
    that the lines are in `clearance_order_items` with `clearance_price` and
    `original_price` as they were quoted, and that the clearance listing's stock
    decremented.
14. Confirm the clearance basket — not the catalogue one — is what got emptied.

**Security spot-checks.** These are one-liners against the deployment URL, and
each should be refused. Run them signed out.

15. `payments.applyVerificationResult` and `payments.verifyPaystack` must not
    exist on the public API at all. Same for all four
    `payment_finalization.finalize*`, `payments.createPayment`, and
    `checkout.settlePaidCheckout`. Convex reports these as unknown functions
    rather than unauthorized, which is the point.
16. `payments.updatePaymentStatus` must return a permission error, not succeed.
    It is the one hand-operated status write left public, for the admin
    reconciliation screen.
17. `checkout.confirmMyCardPayment` with somebody else's reference must return
    "That payment belongs to a different customer". Without that check a
    reference is a bearer token for another customer's checkout.
18. `checkout.beginCheckout` with `paymentMode: "pay_now"` and no `fulfilment`
    must be refused. A pay-now payment with no address cannot be settled, and
    the refusal has to come before the charge.

**Vendor split payments — verify the money actually lands where it should.**
Requires `PRIMARY_BUSINESS_NAME`/`PRIMARY_BANK_CODE`/`PRIMARY_ACCOUNT_NUMBER`
set as Convex env vars, and the test vendor's `business_details` populated.

19. Pay for a basket from a single vendor with a card. In the Paystack
    dashboard, confirm the transaction shows a split with two recipients: the
    vendor's subaccount (their subtotal minus commission) and the platform's
    (commission plus the full delivery fee). The vendor's share must never
    include any part of the delivery fee.
20. Pay for a multi-vendor basket. Confirm each vendor's own subaccount
    receives only their own leg's net, and the platform receives the sum of
    every leg's commission plus every leg's delivery fee.
21. Remove `business_details` from a test vendor and attempt to pay for their
    product. The payment must fail **before the Paystack sheet opens** — "This
    order can't be paid for online right now" — with nothing charged. This is
    the case that would otherwise collect a vendor's money and pay them
    nothing.
22. Pay for the same basket twice in a row (retry after the first completes).
    The second attempt must reuse the existing `split_code` rather than
    creating a second Paystack split for the same reference.

**Both colour schemes** on the payment banners — the confirming, pending,
cancelled and failed states each render on a different surface.

## Known not-done

**Card and M-Pesa payment is done (§20).** Both baskets settle from a
server-held quote and address, driven by a Paystack webhook that can write the
orders with the customer's app closed — see `data/checkout.ts:settlePaidCheckout`.
Clearance is pay-now only; the catalogue basket keeps pay-on-delivery.

**Vendor split payments are wired now, and need live-config verification before
they can charge for real.** `payment_split.prepareMyPaymentSplit` computes the
split from the checkout's stored quote (never live product prices — see
`lib/vendor_split.ts`), creates or reuses each vendor's Paystack subaccount,
and the client passes the resulting `split_code` into the transaction before
the sheet opens. Delivery fee is never split with a vendor — it settles to the
platform in full, alongside commission.

This registers real Paystack subaccounts against real bank details:
`PRIMARY_BUSINESS_NAME`/`PRIMARY_BANK_CODE`/`PRIMARY_ACCOUNT_NUMBER` (and
optionally `SECONDARY_*`) must be set as Convex env vars, and every vendor
that will actually sell needs `business_details.{business_name,bank_code,account_number}`
populated on their vendor record. A vendor missing those fails the whole
payment attempt before the sheet opens — nothing is charged, but the order
cannot be paid for by card until it's fixed. Confirm both against the live
deployment, with a real sandbox charge landing at the correct subaccounts,
before shipping.

**The backend authorization sweep is done, pending review.** 24 of 30
`data/*` modules imported no auth helper — roughly 60 public mutations with no
check, plus every `insights*` query readable by an anonymous caller holding
the deployment URL. Two worth naming: `files.uploadUserIdDocument` let anyone
overwrite or delete any rider's ID document given only their user id, and all
five `stock_reservation.*` mutations were unauthenticated. Closed in three
commits (money/document surfaces, admin catalogue CRUD, picker/rider
operational modules) — see the PR for the full breakdown.
**Social sign-in (Google/Apple/Facebook) is absent, undocumented as a cut.**
The old app wired `useOAuth` for all three plus an `oauth-callback` route.
Nothing in this app references OAuth at all, and neither this file nor any
commit ever said dropping it was deliberate. Confirm whether email-code-only is
the intended product before shipping, not after someone asks where Google
sign-in went.

**`app/+html.tsx` is ported.** Minimal shell — charset, viewport, `<title>`,
`ScrollViewStyleReset`, and a background colour matched by hand to
`global.css`'s `--color-background` in both schemes, so there is no
flash-of-wrong-colour before hydration.

**Legal prose — links now fail honestly instead of pointing at a stranger's
website.** The fallback used to be `https://blink.app`, which redirects to an
unrelated company (`bl.ink`) — confirmed by fetching it. There is no real
production site yet, so `lib/legal.ts` now falls back to a `.invalid`
placeholder (RFC 2606 — guaranteed to never resolve on the real internet), and
every legal link checks `isLegalConfigured()` **before** attempting to open
anything, showing "Legal documents aren't available in this build yet." A
`.invalid` URL still "succeeds" by `openExternal`'s own contract — the browser
tab does launch — so waiting for the open to fail would not have caught this.
Set `EXPO_PUBLIC_LEGAL_BASE_URL` once a real site exists, and confirm the three
paths (`/legal/terms-of-service`, `/legal/privacy-policy`, `/legal/eula`)
actually resolve on it before shipping.

**Referral capture from a QR deep link is built.** The agent dashboard
(`/agent`) shows a QR code for `blink://referral?code=<their code>`; scanning
it opens `/referral` with the code pre-filled and, once signed in, submitted
automatically — still through the same `attributeMyRegistration`, unchanged. A
custom scheme rather than a universal `https://` link, deliberately: there is
no real website yet (see the legal-links fix), so a universal link would 404
or land on the wrong site for anyone scanning without the app already
installed. **To verify:** scan the code from a second device with the app
installed, confirm it opens `/referral` with the code filled in, and that a
signed-in scan credits automatically. Revisit the custom-scheme choice once a
real domain exists — a universal link degrades gracefully to a web page where
this does not.

**Crediting installs.** `incrementInstallCount` is internal and has no public
replacement, deliberately. An install is not verifiable from a client, so
crediting one has to be driven by something the server trusts (a store
attribution callback, or nothing). Until that is decided, installs are counted
but not credited — which is a product decision, not an oversight.

**The customer shipment screens are not ported, on purpose.**
`shipments.tsx` and `shipment-tracking/[shipmentId].tsx` in the old app read
`tracking.getShipmentTracking`, `getRiderLocation`, `getDeliveryTimeline` and
`getEstimatedDeliveryTime` — the four queries that returned whole rider and
customer rows, and live rider GPS, to any caller holding a shipment id. Porting
them would have meant reopening those. `/order/[id]/track` covers what a customer
needs from the same data, owner-scoped.

**Order-to-picker routing is now live for the first time.** Fixing the dead
function references (§19) means `assignOrderToPicker` actually assigns and
notifies. That is what the code was written to do, but it has never run — watch
the picker queue after the first orders.

**Both open money questions are resolved.** Prices are VAT-inclusive, confirmed
by the owner — `quote.tax` stays `0` (nothing is added on top; VAT-inclusive
means it is already in the price) and `components/checkout/order-summary.tsx`
decomposes it for display only (`exVat + vat === subtotal`), which was already
built and already correct. Clearance's own `clearance_service_radius` — wider
than a vendor's normal `service_radius`, so a clearance deal can be visible
where that vendor's catalogue is not — is confirmed intentional: clearance
stock is discounted and time-limited, meant to move faster and reach further
than the regular catalogue. Documented at the read site in
`data/clearance_products.ts`.
