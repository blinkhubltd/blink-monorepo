# Blink Rider

The crew app: one navigator serving both riders and warehouse pickers, with the
queue tab renaming itself per role.

Expo SDK 57 · React Native 0.86.2 · expo-router · NativeWind 4 (Tailwind **v3**)
· Convex · Clerk

## Running it

```bash
cp .env.example .env.local     # then fill in the values
pnpm --filter rider dev
```

`.env.local` holds **only** `EXPO_PUBLIC_*` (plus `CONVEX_DEPLOYMENT`). Anything
Metro reads is inlined into the bundle, so server secrets — Clerk secret key,
Paystack, bank details, the maps *server* key — belong in Convex env vars and
never here.

Locally every var is optional, so a fresh clone starts without configuration.
Under EAS they are all required (see below).

Push and background location need a **dev client or a real build** — neither
works in Expo Go, and remote push does not work on a simulator at all.

## Builds

`eas.json` has four profiles:

| profile | distribution | Android | notes |
|---|---|---|---|
| `development` | internal | `apk` | dev client |
| `development-simulator` | internal | — | iOS simulator |
| `preview` | internal | `apk` | sideloadable, for hub testing |
| `production` | store | `app-bundle` | `autoIncrement`, submits to Play |

Production is `app-bundle`, not `apk`. Play will not accept an APK — the
`eas.json` in the old `blink-rider` repo built production as `apk`, which means
that profile could never actually have been submitted.

`appVersionSource: "remote"` pairs with `autoIncrement`, so EAS owns the build
number and two machines cannot mint the same one.

### Environment variables per profile

`development` and `preview` inline `EXPO_PUBLIC_CONVEX_URL` (the isolated dev
deployment — public, and in the bundle either way). Everything else comes from
the matching **EAS environment**, so nothing sensitive is committed.

`production` inlines **nothing**. Each of these must exist in the EAS
`production` environment before a production build will run:

```
EXPO_PUBLIC_CONVEX_URL              the production deployment
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY   pk_live_...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY     restricted to com.blink.rider
```

`app.config.ts` **throws at config time** when `EAS_BUILD=true` and any of the
three is missing. That is deliberate and it is what makes an empty `production`
profile safe: without it, production would inherit nothing, and an app that
silently pointed at the development deployment is worse than a build that fails.

Set them with `eas env:create --environment production`, or in the project's
Environment Variables page.

### Monorepo

No `.easignore` and no build hooks. EAS detects the pnpm workspace from the root
`pnpm-workspace.yaml` and installs from there, which is what makes
`"@repo/backend": "workspace:*"` resolve. The root `.npmrc` sets
`node-linker=hoisted`, required for Expo autolinking, and EAS honours it.

## Before this ships

- **Clerk allowed redirect URLs need `blinkrider://`.** The scheme changed from
  `starterkitexpo`, so OAuth and email-link flows fail until it is added.
- **The Android package changed** from `com.anonymous.blinkrider` to
  `com.blink.rider`. That means a new Play listing and a forced reinstall — a
  decided trade, but riders need telling.
- **Register the Paystack webhook URL** in the Paystack dashboard.

## Layout

```
app/            expo-router routes. One (tabs) group for both roles.
components/     app-local components; components/pick/* is the picking flow
lib/            pure logic — no React, no Convex, individually tested
lib/data/       the ONLY place that imports `api`; hooks + document mappers
providers/      Convex+Clerk, crew identity, push, background location
tests/          vitest over lib/*
```

Two rules worth keeping:

**No screen imports `api` directly.** Everything goes through `lib/data`, which
is where the backend's rough edges are absorbed — a screen should not have to
know that `verifyDeliveryCode` throws for payment-on-delivery orders, or that the
incentives module uses UPPERCASE role names.

**Anything with a decision in it goes in `lib/` and gets a test.** Not for
coverage — because that is where the bugs were: unit counting, chart bucketing,
the scan cooldown, notification route mapping.
