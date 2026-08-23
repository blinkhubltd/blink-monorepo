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

## Status: Phase B0 complete

Scaffold + vendored backend + green build. **Nothing is deployed.**

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
