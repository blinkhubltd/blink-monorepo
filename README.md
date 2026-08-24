# blink-monorepo

Consolidation of the four Blink apps and their shared Convex backend into one
Turborepo. Built alongside the live repos, which stay untouched and keep
shipping — see `docs/PROVENANCE.md`.

Conventions follow `sydia` and `armor-paints-turborepo`: pnpm workspaces, turbo,
`@repo/*` packages consumed as raw TypeScript via `exports` subpath maps with no
build step.

## Layout

```
apps/                     (empty — apps land in later phases)
packages/
  backend/                @repo/backend    Convex functions + schema
  lib/                    @repo/lib        pure, platform-agnostic utilities
  config/typescript/      @repo/typescript base|convex|nextjs|react-library|expo presets
tooling/audit/            the Phase B0 production audit runbook
parity/baseline/          committed baselines every later phase diffs against
```

## Status: deployed to an isolated deployment

`packages/backend` is deployed to **`doting-bandicoot-348`** (project
`blinkhubltd/blink`, dev), which is deliberately separate from the deployment the
live apps use. Nothing points at it yet.

| | live (`adventurous-hound-19`) | new (`doting-bandicoot-348`) |
|---|---|---|
| functions | 474 | **477** |
| HttpActions | 3 | **7** |
| internal functions | 19 | **24** |
| rows, every table | production data | **0 — empty** |

+4 HttpActions: the new Paystack webhook plus three legacy path aliases.
+5 internal: three cron-only functions, plus `executePayout` and
`assertPayoutPermission` from the payout hardening.
−3 public mutations: `testNotifications.ts` deleted (sample-notification seeding,
zero callers, publicly callable in production).

### Convex folder layout

```
convex/
  schema.ts  validators.ts  auth.config.ts  auth.helpers.ts  http.ts  crons.ts
  data/        47 domain modules
  user/        users, roles, clerk
  actions/     import_jobs_action  ("use node" only)
  webhooks/    agent_scan, location, paystack
  lib/         account_completion, delivery_code, geo, paystack,
               permissions, roles, schedule, status_mapping
```

### validators.ts is the single source of truth for enums

Every enum is a plain `as const` tuple, expanded at each use site with
`v.union(...name.map((e) => v.literal(e)))` — sydia's idiom. **36 named enums
replaced 142 inline union sites**: 61 inside `validators.ts` and 81 across 23
modules.

Proof the rewrite changed nothing observable: `_generated/dataModel.d.ts` and
`_generated/api.d.ts` are both byte-identical before and after. No table shape
moved, and no function argument validator changed shape.

16 unions were deliberately left inline because they are **narrower** than the
shared enum — `approved | rejected` on an approve endpoint, `Processing | Pickup`
on a transition. A tighter argument validator is a feature; widening it would
accept values the endpoint should reject.

The enums are exported through `@repo/backend/validators`, so the apps can import
what the database validates against instead of hand-copying string literals the
way `blink-rider/lib/constants.ts` does today.

Two known data-model defects are pinned by test rather than silently fixed, since
both need a migration: `payments.status` is Title case while
`transactions.status` is lowercase for the same four concepts, and
`transactions.payment_method` accepts 2 of the 6 methods, so a
payment-on-delivery order can never produce a transaction row.

Duplicated object shapes are also extracted — 19 sites across 5 named shapes,
**1393 -> 1223 lines**:

| shape | sites |
|---|---|
| `weeklyOpeningHours` | 2 |
| `weeklyShiftSchedule` | 2 |
| `postalAddress` | 4 |
| `geoPoint` | 7 |
| `addressWithCoordinates` | 4 |

There are **two** week shapes rather than one because
`VendorsValidator.schedule.weeklySchedule` and `SchedulesValidator.weeklySchedule`
had already diverged: the second carries a required `enabled` the first does not.
Unifying them needs a data migration, so the divergence is named and kept.
`UsersValidator.address` and `ShipmentValidator.delivery_address` are likewise
left alone — they carry extra fields (`street`, `state`, `postal_code`), and
widening them would change what those tables accept.

`helpers/` and `hooks/` are gone. Where their contents went:

| was | now | note |
|---|---|---|
| `helpers/geo.ts` | `lib/geo.ts` | duplicate; the surviving copy is in metres |
| `helpers/scheduleHelpers.ts` | `lib/schedule.ts` | already pure, moved wholesale |
| `hooks/generateDeliveryCode` | `lib/delivery_code.ts` | **not dead** — `data/orders.ts` uses it |
| `hooks/validateRiderActivation` | `lib/account_completion.ts` | same concern, merged |
| `helpers/getUserByClerkId` | `auth.helpers.ts` | same `by_clerkId` lookup as `getAuthUser` |
| `helpers/statusSync.ts` | `data/shipments.ts` | ctx-using, so not `lib/`; now typed `MutationCtx` |
| `helpers/dbHelpers.ts` | deleted | 105 LOC unreachable; `catch { return [] }` made "not found" and "DB error" indistinguishable |
| `helpers/index.ts` | deleted | barrel; 8 of its 12 re-exports had no importer |

`lib/` follows sydia's rule — testable without `_generated` — with one ctx-taking
file (`account_completion.ts`), mirroring sydia's own `lib/images.ts`.

**App-side follow-up:** four `blink-ecommerce` files import `Id` from
`@/convex/helpers`. That barrel no longer exists, so they must move to
`@repo/backend/dataModel` when the app is ported.

Two constraints learned the hard way and worth recording:

- **`convex/actions/` is a reserved folder.** Every file in it must declare
  `"use node"`, or the deploy is rejected outright. So `actions/` holds only
  genuine Node-runtime actions — for Blink that is `importJobsAction` alone,
  which needs `xlsx`. `geocode` and `directions` are ordinary actions and live in
  `data/`. This happens to match what sydia's `actions/` actually means.
- **Module paths may not contain hyphens.** File names are still camelCase; the
  rename to snake_case is a separate commit so the move stays reviewable.

Folder moves change `api.*` paths (`api.orders.get` becomes
`api.data.orders.get`) and Convex has no path aliasing. That is free here because
nothing points at this deployment — but when the apps switch over, every moved
path needs either a coordinated release or a forwarding shim. See §11 of the plan.

Isolation verified after deploying: the live deployment still reports 474
functions with zero added and zero removed.

### Endpoints

HTTP actions are served from `.convex.site`, not `.convex.cloud`:

```
https://doting-bandicoot-348.convex.site/api/v1/webhooks/clerk
https://doting-bandicoot-348.convex.site/api/v1/webhooks/paystack
https://doting-bandicoot-348.convex.site/api/v1/riders/location
https://doting-bandicoot-348.convex.site/api/v1/agents/scan
```

Each also answers on its original unversioned path (`/clerk`, `/rider/location`,
`/agent/scan`) so an existing dashboard configuration keeps working.

Verified live against the deployment: an unsigned or wrongly-signed request to
either webhook returns **401**, the legacy alias behaves identically, and an
unrouted path returns 404. A 401 rather than 503 also confirms both signing
secrets are set.

**Register the Paystack URL** in the Paystack dashboard (Settings → API Keys &
Webhooks) — it is a new endpoint and nothing points at it yet.

### Environment variables

Set on the deployment: `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`,
`PAYSTACK_SECRET_KEY`.

`CLERK_JWT_ISSUER_DOMAIN` is the only variable that blocks a deploy —
`auth.config.ts` throws at module load without it, deliberately, since a
deployment that cannot validate tokens should not boot. Every other `process.env`
read is lazy or has a fallback. The two webhook secrets fail closed at *request*
time with a 503 rather than at module load, because Clerk and Paystack only issue
a signing secret once you register an endpoint, and you cannot register one
without a deployed URL.

`AUTH_SHADOW_MODE` is unset, so `assertPermission` would enforce. That is
currently moot — `auth.helpers.ts` exists but no function calls it yet, so this
deploy changes no access control. Set it to `"true"` before wiring the first
guard.

The deploy key in use is scoped to code deploys only: it has neither
`deployment:env:view` nor `deployment:env:write`, so environment variables must be
managed from the dashboard.

The Convex backend was vendored from `blink-admin/convex` at `origin/main`
= `3c56937`, which is a strict superset of all three app pins — verified:
`2858eee` (admin), `d0490b06` (ecommerce) and `04a8c3bd` (rider) are each an
ancestor of it. The `d0490b0` cherry-pick that earlier plans called for has since
been merged upstream and is a no-op.

**74 of 74 files are byte-identical to `origin/main`**, verified by comparing
each against `git show origin/main:<file>`. The source repo has
`core.autocrlf=true`, so `git archive` emitted CRLF; the tree is normalised to LF
and pinned by `.gitattributes`, which is why the byte comparison passes.

### The only changes in B0

Seven files touched, 67 untouched. Every edit is required to make the tree compile
standalone — it never could before, because it had no `package.json` and no
`tsconfig.json`. None of them changes runtime behaviour.

| File | Change | Why |
|---|---|---|
| `convex/hooks/index.ts:2` | `@/convex/validators` -> `../validators` | path alias |
| `convex/pushTokens.ts:1` | `@/convex/_generated/api` -> `./_generated/api` | path alias |
| `convex/users.ts:4` | `@/convex/hooks` -> `./hooks` | path alias |
| `convex/validators.ts:2` | removed `import { latitudeKeys } from "geolib"` | unreferenced |
| `convex/files.ts:5` | `mutation(fn)` -> `mutation({ args: {}, handler: fn })` | TS2742 |
| `convex/categories.ts:16` | same | TS2742 |
| `convex/stockReservation.ts:283` | added `args: {}` | TS2742 |

**The three path aliases are the same bug**: a repo-root alias inside a submodule
that had no `tsconfig.json` of its own. They resolved only via each parent repo's
alias configuration, so a consumer whose alias differed could not build the
backend at all. That is the most likely reason the three app pins diverged in the
first place. The audit found one of these; there were three.

**The three `args: {}` additions** fix `TS2742` ("inferred type cannot be named
without a reference to node_modules"), which fires on a Convex registration that
omits `args` under `declaration: true`. Verified safe before applying: all 12
`generateUploadUrl` call sites across the three apps pass no arguments, and
`cleanupExpiredReservations` is only called by `crons.ts:18`, also with none. So
the stricter contract rejects nothing that is actually sent.

Three previously undeclared dependencies are now declared: `geolib` (used by
`dispatch.ts` and `clearanceBatching.ts`), `svix` (Clerk webhook verification),
and `xlsx` (imported by `importJobsAction.ts`, the only `"use node"` action —
hence the `convex.json` `node.externalPackages` entry).

`convex` is pinned to `^1.27.1`: the three apps had drifted to 1.25.4 / 1.26.2 /
1.27.1, and 1.27.1 is both the highest already in production use and the only
choice that is not a downgrade for any of them.

### Two tsconfig overrides, both deliberate

`packages/backend/tsconfig.json` extends the shared `@repo/typescript/convex.json`
but turns off two things, with reasons in the file:

- **`noUncheckedIndexedAccess: false`.** The shared preset enables it; this tree
  has never been typechecked under it, and turning it on surfaces **130 errors
  across 17 files** (`importJobsAction` 33, `insights` 17, `products` 15,
  `dispatch` 9, `payments` 8, `cart` 8, ...). Each is a decision about what the
  code should do when a value is absent, not a mechanical fix, and there are no
  tests to catch a wrong answer. Re-enable per-module as Phase B3 moves each file.
  **This is tracked debt, not a settled choice.**
- **`declaration: false`.** Nothing consumes this package's `.d.ts` — apps import
  `_generated/api.js` and `_generated/dataModel.d.ts`.

### Verification

```
pnpm turbo check-types    2 successful
pnpm turbo test           2 successful (no tests yet — see packages/backend/tests)
pnpm turbo lint           0 tasks (no lint configs until B1 adds the auth rule)
```

Byte-for-byte comparison against `git show origin/main:<file>` for all 74 files:
67 identical, 7 modified exactly as tabled above.

### Found along the way, for later phases

- **`api.categories.generateUploadUrl` has zero callers.** Only
  `api.files.generateUploadUrl` is ever used — the two are identical. Delete in B2.
- The vendored tree contains no `.env` files, no `.gitmodules`, and no
  credential-shaped strings. The only `sk_test_` / `whsec_` occurrences are a
  key-format validation branch in `payments.ts:657` and a line of setup
  documentation in `convex/README.md`.

### What was deliberately not touched

`convex/schema.ts` — 339 lines, zero validators (every table shape lives in
`validators.ts`), all 37 tables indexed, `orders` carrying 13 indexes plus a
search index. It already matches the target convention and is the strongest
artifact in the codebase.

## Next

**Run `tooling/audit/RUNBOOK.md` before writing any more code.** Three decisions
depend on data that exists only in the live deployment, and one of them — the
`roles` dump — gates every permission check in Phase B1. Adding a permission
guard before reading that table would lock out every administrator.

Then Phase B1: the security deploy. See §11 of the plan for full sequencing.

## Commands

```bash
pnpm install
```

```bash
pnpm turbo check-types
```

```bash
pnpm --filter @repo/backend dev
```

### data/payments.ts split

2593 lines, 33% of it a single action handler. Now six files:

| file | lines | holds |
|---|---|---|
| `data/payments.ts` | 833 | queries, payment-record mutations, verification, initiation |
| `data/payment_split.ts` | 1062 | `preparePaystackSplitForCheckout` and the nine helpers only it used |
| `data/payment_finalization.ts` | 685 | the four `finalize*Orders` mutations |
| `data/paystack_api.ts` | 68 | `paystackRequest`, `getPaystackCurrency` — the only `fetch` site |
| `lib/json.ts` | 24 | safe navigation of untyped API responses |
| `lib/env.ts` | 19 | `requireEnv` / `getOptionalEnv` |

A pure move: no handler body was rewritten. Verified by the deployed function
count staying at 477, with `payments` 14 + `payment_finalization` 4 +
`payment_split` 1 = the 19 the single file used to export, and
`dataModel.d.ts` unchanged.

Two follow-ups deliberately left: collapsing the four finalizers into one
parameterised mutation (needs extract-then-collapse plus a golden-record replay,
since they create orders and mark payments consumed with no tests), and breaking
the 858-line split handler into stages. Also note `data/payment_split.ts` keeps
its own `toMinorUnits`, which differs from the one in `lib/paystack.ts`: the local
one returns `NaN` silently, the shared one throws. Reconciling them changes
behaviour on a live payment path, so it needs a decision rather than a tidy-up.
