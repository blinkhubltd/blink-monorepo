# Provenance

This repo has a fresh history. History-preserving grafts were rejected: four
unrelated root histories make `git log` unreadable and `git bisect` useless
across the seam, and blame stops at the graft anyway for every file that the
Gluestack removal, SDK 55 upgrade and Next 16 upgrade rewrite — which is most of
them. The old repos stay readable instead, and this file is the map.

| Path here | Source repo | Commit vendored |
|---|---|---|
| `packages/backend/convex/` | `pardiprai/blink-convex` via the `blink-admin` submodule | `origin/main` = `3c5693788da7e804785efe830d748694a01b87d6` |

## Pins superseded

All three app repos carried the backend as a git submodule at diverging commits.
`3c56937` is a strict superset of all three; each is an ancestor of it.

| Repo | Pin | Relationship to `3c56937` |
|---|---|---|
| `blink-admin` | `2858eee` | ancestor |
| `blink-ecommerce` | `d0490b06` | ancestor (merged upstream since) |
| `blink-rider` | `04a8c3bd` | ancestor |

The standalone clone at `Desktop/blink-convex` sits at `928308e` and is missing
roughly twenty modules. **It is not a valid vendoring source.**

## Still to come

Each app directory gets a row here as it is ported, recording the source repo and
the exact commit, so any blame question is one `git log` away in an archived repo.
The four source repos are to be tagged `pre-monorepo` and archived read-only —
never deleted; they hold the issues and PR discussion.
