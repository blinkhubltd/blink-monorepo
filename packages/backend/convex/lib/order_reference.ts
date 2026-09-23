/**
 * The order reference a customer or an admin actually reads: exactly 10
 * digits, nothing else — no prefix, no letters, no separators.
 *
 * ── Not the payment reference ─────────────────────────────────────────────
 *
 * `orders.reference` used to just BE the checkout's payment/idempotency
 * reference (`SHOP_${Date.now()}_${random}`, or `CLR_...` for clearance),
 * suffixed per vendor leg. That string exists for a reason — the Paystack
 * webhook, the double-tap guard on `by_payment_reference`, the returning-app
 * race — and none of that changes here. It stays exactly as it was, stored
 * separately as `payment_reference` and `idempotency_key`. This generator
 * produces a second, independent value for the one field a person is ever
 * asked to read out or type in: `orders.reference`.
 *
 * ── Why fully random rather than timestamp-based ──────────────────────────
 *
 * `writeOrdersFromQuote` calls this once per vendor leg in a synchronous
 * loop, so a multi-shop basket mints several references within the same
 * millisecond — a low-order-digits-of-`Date.now()` scheme would collide
 * across those legs far more often than plain randomness does. There is no
 * uniqueness index on this field and nothing queries by it (it is read, never
 * looked up), so an astronomically unlikely collision is a display
 * annoyance, not a data-integrity problem the way a collision on
 * `payment_reference` would be.
 *
 * The leading digit is drawn from 1–9, never 0: a reference that starts with
 * "0" reads as though a leading digit went missing the moment it is copied
 * into a spreadsheet cell or a support ticket, since both commonly drop
 * leading zeros from anything that looks numeric.
 */
export function generateOrderReference(): string {
  let digits = String(1 + Math.floor(Math.random() * 9));
  for (let i = 1; i < 10; i++) {
    digits += String(Math.floor(Math.random() * 10));
  }
  return digits;
}
