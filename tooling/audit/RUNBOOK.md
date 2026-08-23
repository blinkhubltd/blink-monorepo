# Phase B0 production audit

Read-only. Run before any code change ships. Three later decisions depend on data
that exists in no git tree, only in the live deployment.

Run everything from `packages/backend`.

---

## 1. The function-spec baseline

The authoritative record of what is deployed and at what visibility. Every later
phase diffs against it; every intentional difference belongs in that phase's
changelog. This is the single most important artifact in the audit.

```bash
npx convex function-spec --prod > ../../parity/baseline/function-spec.prod.json
```

Commit it. Then, after any deploy:

```bash
npx convex function-spec --prod > /tmp/after.json && diff ../../parity/baseline/function-spec.prod.json /tmp/after.json
```

Sanity checks to record alongside it:

```bash
# public vs internal split — expect roughly 453 public / 19 internal
grep -c '"visibility": *{ *"kind": *"public"' ../../parity/baseline/function-spec.prod.json
grep -c '"visibility": *{ *"kind": *"internal"' ../../parity/baseline/function-spec.prod.json
```

Also confirm the preview deployment matches, which is what proves the vendored
tree is behaviourally equivalent at the API surface:

```bash
npx convex function-spec > /tmp/preview.json
diff <(jq -S '[.functions[] | {identifier, functionType, visibility}]' ../../parity/baseline/function-spec.prod.json) \
     <(jq -S '[.functions[] | {identifier, functionType, visibility}]' /tmp/preview.json)
```

---

## 2. The roles dump — gates all permission work

**Nothing that adds a permission check may ship until this is read.**
`blink-admin/lib/hooks/useCurrentUserPermissions.ts` returns `true` from `can()`
for any user whose role is not Rider/Picker/Customer, regardless of
`role.permissions`. So `role.permissions` may be empty for every real
administrator and the UI would never reveal it. A permission gate dropped onto
that data locks out everyone.

```bash
npx convex data roles --prod --limit 200
npx convex data users --prod --limit 5      # confirm the role_id field shape
```

Record, per role: `_id`, `name`, `is_default`, the full `permissions` array, and
how many users hold it. Then answer, explicitly, in `parity/baseline/roles-audit.md`:

1. Does **any** role hold `"*"`?
   Expect **no** — `blink-admin/components/roles/RoleForm.tsx` cannot emit it.
   If none, a superadmin bootstrap in `seed.ts` is mandatory before any gate.
2. For every role where the name is not Rider/Picker/Customer: how many users,
   and does its `permissions` array actually grant what the admin UI currently
   lets those users do? Apply the inheritance rules from
   `blink-admin/lib/dashboard-permissions.ts` — `CREATE` satisfies `UPDATE` and
   `DELETE` — because a flat `includes()` check does not reproduce them and would
   silently revoke update/delete from every role granted only `CREATE`.
3. Does every `permissions` entry parse as `<resource>:<ACTION>` against
   `RESOURCES` x `ACTIONS` in `convex/lib/permissions.ts`?
   `RolesValidator.permissions` is `v.array(v.string())` — unvalidated, so junk
   may exist.
4. Is any role named exactly `Admin`? Ten mutations in `incentives.ts` gate on
   `roleName !== "Admin"`, and `"Admin"` is not in `SYSTEM_ROLES`. If no role
   matches, that gate denies everyone and the feature is unreachable — which
   makes replacing it with a permission check a *widening* of access, not a
   refactor.
5. Is `users.isStaff` a subset of "users whose role grants prescriptions:UPDATE"?
   It gates `prescriptionRejectionReasons.ts` independently of `role_id`.
   Almost certainly not a subset — determines whether the bridging
   `assertStaffOrPermission` is temporary or permanent.

---

## 3. Row counts — set the deadline on insights.ts

Convex caps a single query at **16,384 documents**. `insights.ts:1272-1276`
collects `vendors` + `industry` + `order_items` + `products` + `categories` in
one query. When `order_items` crosses the cap that query does not get slow — it
**throws**, and the dashboard goes blank. This is a scheduled outage, not a
latency problem.

```bash
for t in orders order_items products users vendors payments transactions agents; do
  echo "== $t"; npx convex data "$t" --prod --limit 1
done
```

`npx convex data` prints the total. Record all eight in
`parity/baseline/row-counts.md`.

**Decision rule:** if `order_items` is within 2x of 16,384, pull the
`insights_snapshots` work out of Phase B6 and into Phase B2.

---

## 4. Has the Paystack split ever executed?

The user confirmed multi-vendor split is a shipped feature, but
`preparePaystackSplitForCheckout` has **zero callers** in any of the three apps
or internally. So it is shipped in intent and unwired in fact.

```bash
# count payments rows carrying split evidence
npx convex data payments --prod --limit 500 | grep -c 'paystack_split_code'
```

If the count is zero, no multi-vendor order has ever been split and revenue has
been settling to a single account. **That is a finance question, not an
engineering one — raise it before writing any code.**

---

## 5. Payment-on-delivery reporting gap

`TransactionsValidator.payment_method` allows only `Card | Mobile Money`, while
Orders and Payments allow six values including `Cash on Delivery`. So a
payment-on-delivery order can never have produced a transaction row.

```bash
npx convex data orders --prod --limit 1        # total orders
npx convex data transactions --prod --limit 1  # total transactions
```

Compare `count(orders where payment_method = "Cash on Delivery")` against
transactions over the same window. If finance reports off `transactions`, that
revenue has been invisible for the lifetime of the table, and the fix may require
backfilling rows that never existed — a decision about historical restatement.

---

## 6. Confirm the deployment's environment variables

```bash
npx convex env list --prod
```

Specifically confirm `CLERK_WEBHOOK_SECRET` and `LOCATION_INGEST_API_KEY`, both
referenced in code but absent from every source `.env` file. If
`CLERK_WEBHOOK_SECRET` is unset, every Clerk webhook has been returning 500 and
user sync has silently stopped.

---

## 7. Stop the double-deploy hazard

Once the monorepo deploys to prod, **no other repo may ever run `convex deploy`**.
A stale pin pushing over the monorepo's tree would silently revert every security
fix. Before B1:

- Remove the `convex` submodule from `blink-admin`, `blink-ecommerce`, `blink-rider`.
- Remove every `convex:dev` / `convex:deploy` / `convex:logs` script from their
  `package.json` files.
- Rotate the Convex deploy key so only monorepo CI holds it.
- Rotate the GitHub PAT embedded in `blink-admin/.gitmodules` — it is tracked in
  git and therefore in the repo's history on GitHub, regardless of what the
  monorepo does.
