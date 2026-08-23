# Phase B0 production audit — findings

Run against the live deployment. Read-only throughout; nothing was written or deployed.

---

## 0. There are two deployments, and "prod" is not the live one

| Deployment | URL | Functions | Modules | Used by the apps? |
|---|---|---|---|---|
| **dev** | `adventurous-hound-19.convex.cloud` | **474** | **50** | **Yes — all three** |
| prod | `wary-dogfish-636.convex.cloud` | 319 | 33 | No |

All three apps ship `NEXT_PUBLIC_CONVEX_URL` / `EXPO_PUBLIC_CONVEX_URL` =
`adventurous-hound-19`, and all three `.env.local` files bind `CONVEX_DEPLOYMENT`
to the identical `dev:` deployment (verified by hashing the values — same sha).

**So the customer-facing apps run against a Convex *dev* deployment.** The
deployment named prod is stale: 33 modules against the source tree's 57, missing
`agentPaymentRequests`, `paystackSubaccounts`, `roles`, `platformSettings`,
`marketing`, `transactions`, `location`, all clearance modules and `importJobs`.

Two consequences:

1. **There is no dev/prod isolation.** Any `convex dev` run by any developer
   pushes over the deployment that serves live customers.
2. `blink-ecommerce/providers/ConvexClientProvider.tsx` hardcodes
   `https://wary-dogfish-636.convex.cloud` as its fallback URL. A build with a
   missing env var therefore talks to the *stale* deployment — different data,
   half the modules absent. Not a security hole, but a confusing failure mode.

Everything below is measured on **`adventurous-hound-19`**, the live one.

---

## 1. Function surface baseline

Committed as `function-spec.live.json` (the deployment the apps use) and
`function-spec.prod.json` (the stale one). Diff against these after every deploy.

| | Query | Mutation | Action | HttpAction |
|---|---|---|---|---|
| public | 224 | 205 | 23 | — |
| internal | 5 | 14 | 0 | — |
| n/a | | | | 3 |

**452 public / 19 internal**, closely matching the source audit. Zero
`internalAction` against 23 public actions, every one of which makes outbound
HTTP calls.

## 2. The payout chain is live and public — confirmed

All four verified `PUBLIC` on `adventurous-hound-19`:

| Function | Type | Args |
|---|---|---|
| `agentPaymentRequests:createPaymentRequest` | Mutation | `agentId, amount` |
| `agentPaymentRequests:updatePaymentRequestStatus` | Mutation | `id, processedBy, rejection_reason, status` |
| `agentPaymentRequests:processPaymentRequest` | Action | `processedBy, requestId` |
| `agentPaymentRequests:createAgentPaystackRecipient` | Action | `agentId, mpesaNumber` |

`processedBy` is a client-supplied argument on both the approve and the execute
step — the audit trail is forgeable. Also confirmed public:
`paystackSubaccounts:upsert`, `users:fixClerkIdMismatch`, `users:updateUserRole`,
`roles:createRole`, `platformSettings:upsert`,
`testNotifications:seedSampleNotifications`.

`agent_payment_requests` currently holds **3 rows**.

---

## 3. Risk #1 is much smaller than modelled — but not zero

The concern was that `role.permissions` might be empty for every real
administrator, so enforcing `assertPermission` would lock everyone out. **It is
not.** All five admin-facing roles carry real permissions.

| Role | Permissions | Users | System role |
|---|---|---|---|
| SUPER ADMIN | 54 | **4** | no |
| GENERAL MANAGER | 23 | 0 | no |
| Hub Manager | 22 | 0 | no |
| Supervisor | 17 | 0 | no |
| Clearance Vendor Manager | 5 | **1** | no |
| CUSTOMER | 0 | 23 | yes |
| RIDER | 0 | 3 | yes |
| PICKER | 0 | 2 | yes |

**Blast radius: 5 users.** 57 distinct permission strings, **zero malformed** —
every one parses as `resource:ACTION`. Actions in use: `CREATE`, `READ`, `UPDATE`
(no `DELETE`), matching `lib/permissions.ts`.

Three things still to handle:

- **No role holds `"*"`.** A superadmin bootstrap in `seed.ts` is still required,
  or `assertPermission` must treat SUPER ADMIN's explicit list as sufficient.
- **SUPER ADMIN is missing all three `clearance:*` permissions** (54 of 57).
  Today `isAdminUser` grants it clearance access anyway; the moment enforcement
  lands, SUPER ADMIN loses it. This is exactly the lockout the shadow-mode soak
  exists to catch — and it is a one-row fix, not a redesign.
- **The DB grants 19 distinct resources; `lib/permissions.ts` defines 17.** Two
  resources exist in data but not in code. Reconcile before typing `Permission`,
  or the template union will reject live values.

Resources granted in the DB: `agents, banners, categories, clearance, customers,
industries, insights, orders, payments, pickers, prescriptions, products, riders,
roles, schedules, shipments, staff, users, vendors`.

### Two source-code gates resolved

- **No role is named exactly `Admin`.** So `incentives.ts`'s ten mutations gated
  on `roleName !== "Admin"` currently **deny everyone** — the feature is
  unreachable in production. Replacing that gate with a permission check is a
  **widening of access**, not a refactor, and needs sign-off.
- `isStaff` still to be cross-checked against role grants.

---

## 4. `insights.ts` is not an imminent outage — de-scope it

Convex caps a query at 16,384 documents. Actual row counts:

| Table | Rows |
|---|---|
| products | **1,467** |
| payments | 102 |
| order_items | 50 |
| orders | 37 |
| users | 34 |
| vendors | 23 |
| agents | 8 |
| clearance_products | 4 |
| agent_payment_requests | 3 |
| **transactions** | **0** |

Largest table is `products` at 1,467 — **an order of magnitude below the
ceiling**. The five-table collect at `insights.ts:1272-1276` is nowhere near
failing.

**Decision: the `insights_snapshots` work stays in Phase B6.** Do not pull it
forward. Re-check when `order_items` passes ~8,000.

The corollary is that this is an early-stage dataset, which lowers the risk of
the whole migration — including the Phase B5 field renames.

---

## 5. Product decisions — evidence

**Split IS shipped, and has executed.** 12 of 102 `payments` rows carry a
`paystack_split_breakdown` containing a `split_code`. So the feature works and
has run — despite `preparePaystackSplitForCheckout` having zero callers in any
app. **Some other path is producing those splits. Find it before refactoring**;
the 858-line action may not be the live one.

**Delivery fee.** `platform_settings` is the chosen single source. Confirm
`free_delivery_threshold` is seeded before deleting the hardcoded `2000` in
`cart.ts:649`.

**`transactions` is completely empty — 0 rows.** This reframes the COD question:
it is not that payment-on-delivery is missing from `transactions`, it is that
**nothing has ever been written to `transactions` at all**. Finance cannot be
reporting off it, so there is no historical restatement to do — only a decision
about whether the table should start being written. `payment_method` values
actually in use across 37 orders: `Card` 21, `Cash on Delivery` **9**,
`Mobile Money` 7. The rename to `Payment on Delivery` touches **9 rows**.

---

## 6. Deployment environment — healthy

Set on the live deployment: `CLERK_FRONTEND_API_URL`, `CLERK_JWT_ISSUER_DOMAIN`,
`CLERK_WEBHOOK_SECRET`, `LOCATION_INGEST_API_KEY`, `PAYSTACK_SECRET_KEY`,
`PRIMARY_ACCOUNT_NUMBER`, `PRIMARY_BANK_CODE`, `PRIMARY_BUSINESS_NAME`,
`SERVER_GOOGLE_MAPS_API_KEY`, `TEST_ACCOUNT_NUMBER`, `TEST_BANK_CODE`.

- **`CLERK_WEBHOOK_SECRET` is set.** The Clerk webhook is working; the earlier
  concern that user sync was silently returning 500 is **wrong and is withdrawn**.
- **`LOCATION_INGEST_API_KEY` is set** — though `location.ts` is not deployed at
  all on the live deployment, so its broken auth fallback is currently
  unreachable.
- `SECONDARY_*` payout vars are **not** set; only `PRIMARY_*` and `TEST_*`.

---

## Revised priorities

1. **`location.ts` is not deployed**, so the broken `body.clerkId` fallback is not
   currently exploitable. Drops from B1 to B2.
2. **`insights.ts` snapshots** stay in B6. Confirmed de-scoped.
3. **The dev/prod split is now the top infrastructure item**, ahead of most of B1:
   customers are served from a dev deployment that any developer's `convex dev`
   can overwrite. Promote a real prod deployment and repoint the apps.
4. The payout gates and visibility flips proceed as planned — 5 admin users and a
   3-row `agent_payment_requests` table make this about as low-risk as it will
   ever be.

---

## Reproducing

See `../../tooling/audit/RUNBOOK.md`. Note the runbook's `--prod` flags target
the **stale** deployment; drop `--prod` to hit the live one until a real prod
deployment exists.

Artifacts committed alongside this file:
`function-spec.live.json`, `function-spec.prod.json`, `roles.raw.json`,
`permission-vocabulary.txt`, `deployed-modules.txt`, `deployed-modules.live.txt`,
plus the `analyze-roles.js` / `coverage.js` scripts used to produce the tables.
