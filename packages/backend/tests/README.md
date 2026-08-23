# Backend tests

Tests live here, **outside `convex/`**, deliberately. Convex bundles everything
under `convex/` for deployment, so a `vitest` import inside that directory breaks
the deploy. Test file names use kebab-case; Convex module paths may not contain
hyphens, but this directory is not a Convex module path.

The rule inherited from sydia: **test pure policy, never handlers.** Anything
needing `ctx` or importing `_generated` is out of scope — that is the boundary
that defines `convex/lib/`. Time is injected as a parameter, never read via
`Date.now()` inside the function under test.

Empty until Phase B2 extracts the first pure modules. Planned first suite, in
priority order (see §11 of the plan):

| File | Covers | Why first |
|---|---|---|
| `status-mapping.test.ts` | shipment -> order status map | Currently duplicated verbatim in two files with hardcoded literals in six more. The exhaustiveness assertion — map key set equals the shipment-status enum — is the test that would have caught the drift. |
| `delivery-fee.test.ts` | `computeDeliveryFee` | Three code paths disagree today (250 / 200 / 150). Now settings-only, so a missing key must throw rather than silently resolve to a default. |
| `geo.test.ts` | haversine, in **metres** | Three implementations exist, one in kilometres and self-labelled a mock. This test documents the unit and kills the other two. |
| `payout-window.test.ts` | `isPayoutWindowOpen` | A money gate whose input anyone can rewrite until B1 lands. Empty config must **fail closed**. |
| `commission.test.ts` | Paystack split arithmetic | Multi-vendor split is a shipped feature, so this goes live. Invariant: `sum(vendor_minor) + commission_minor + delivery_fee_minor === total_minor` at integer precision, no cent created or destroyed. |
| `search-text.test.ts` | `computeSearchText` | Nine implementations collapse to one. Capture the current output of all nine against sample rows **first** and make those the expected values — the search indexes depend on the string being unchanged. |
| `shift.test.ts` | shift window boundaries | Overnight shifts crossing midnight are where these always break. |
