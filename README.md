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
  data/        43 domain modules — 416 functions
  user/        users, roles, clerk           — 53 functions
  actions/     importJobsAction              —  1 function  ("use node" only)
  webhooks/    clerk-adjacent httpActions: agentScan, location, paystack
  lib/         pure, ctx-free, unit-tested
  helpers/     legacy — being dissolved into lib/
  hooks/       legacy — to be dissolved
```

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
