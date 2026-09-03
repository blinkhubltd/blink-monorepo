import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * ESLint for the admin app.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * The `lint` script was `next lint`, which Next 16 removed — it exited with
 * "Invalid project directory provided, no such directory: apps/admin/lint",
 * because `lint` was being read as a positional path argument. There was also no
 * ESLint config anywhere in the workspace, so `next lint` would have prompted to
 * create one interactively and never actually linted anything in CI. This app has
 * therefore never been linted.
 *
 * ── Scope ───────────────────────────────────────────────────────────────
 *
 * Admin only, deliberately. The two Expo apps have their own resolver and
 * platform-file concerns (`.web.tsx`, `nativewind` class props) and would need a
 * different config; sharing one now would mean designing for three consumers
 * before any of them is proven. If rider and shop want linting, the shape to
 * promote is `packages/config/eslint`, matching `@repo/typescript` and
 * `@repo/tailwind`.
 *
 * ── What is enabled ─────────────────────────────────────────────────────
 *
 * `eslint-config-next/core-web-vitals` (which already includes the base Next
 * config — it is `index` plus the web-vitals rules, so pulling both in would
 * register the same plugin twice) and `eslint-config-next/typescript`, which is
 * `typescript-eslint` recommended with `no-unused-vars` and
 * `no-unused-expressions` at warn.
 *
 * Not type-aware checking (`recommendedTypeChecked`). That needs a program per
 * lint run and roughly triples the time, and it would duplicate what
 * `tsc --noEmit` already does in the `check-types` task — which is a separate
 * turbo task, so both run anyway. ESLint here is for the things the compiler
 * cannot see.
 */
export default [
  {
    // Generated, vendored, or not ours. `@repo/.ignored_backend` is a pnpm
    // artefact of the vendored backend and contains a second copy of every
    // Convex function; linting it reports the same findings twice.
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      "**/_generated/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    /*
      ── The baseline, and why most of it is a warning ──────────────────────

      This app had never been linted, so switching the preset on produced 570
      findings. A task that fails on all of them fails forever and gets deleted;
      one that reports them where they are gets fixed a file at a time. So the
      pre-existing volume is set to WARN with its count recorded here, and the
      rules that catch crashes stay ERROR.

      Baseline at setup (2026-08-31), after fixing everything at error level:

        212  no-explicit-any                      warn
        125  no-unused-vars                       warn
         58  react-hooks/exhaustive-deps          warn (preset default)
         47  react-hooks/set-state-in-effect      warn
         34  no-console                           warn
         26  react-hooks/static-components        warn
         16  react/no-unescaped-entities          warn
         10  react-hooks/incompatible-library     warn (preset default)
          6  @next/next/no-img-element            warn (preset default)
          6  react-hooks/immutability             warn
          5  react-hooks/purity                   warn
          3  react-hooks/refs                     warn
          2  react-hooks/preserve-manual-memoization  warn
          1  import/no-anonymous-default-export   warn

      `--max-warnings` is deliberately NOT set. Pinning it to today's count
      makes the build fail on an unrelated change that happens to add a
      warning, and moves it whenever anyone deletes a file — a number that
      drifts is a number people learn to bump. The count above is the thing to
      compare against.

      ── What stays an error ───────────────────────────────────────────────

      `react-hooks/rules-of-hooks`, at the preset's own error level. It is the
      one rule here that catches a crash rather than a smell, and the setup
      proved it: all fourteen violations were in `payments/page.tsx`, where a
      permission gate sat above every hook. On the first render `currentUser` is
      null while auth resolves, so React recorded zero hooks; when auth resolved
      and the gate passed, the next render called fourteen and React throws
      "Rendered more hooks than during the previous render". That page was
      reachable only for whoever had `currentUser` synchronously. Fixed by moving
      the gate below the hooks.
    */
    rules: {
      // 212 sites. Real ones hide behind the volume — `payments/page.tsx` casts
      // a Convex result to `any[]` to test a field, so a schema change there
      // fails silently rather than at compile time.
      "@typescript-eslint/no-explicit-any": "warn",

      // 125 sites, mostly residue of half-finished edits. `^_` stays allowed:
      // it is the deliberate convention already used for intentionally unused
      // arguments in this codebase.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      /*
        The React Compiler-era rules from eslint-plugin-react-hooks v7. These
        are worth reading rather than silencing — `set-state-in-effect` in
        particular is how a render loop starts — but 89 findings across them is
        a project, not a lint fix.
      */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",

      // Apostrophes in copy. Cosmetic, and 16 of them.
      "react/no-unescaped-entities": "warn",

      // A bare `console.log` in an admin screen ships to the browser console of
      // whoever runs the business. `console.error` and `console.warn` stay
      // allowed — they are how the existing error paths report.
      "no-console": ["warn", { allow: ["warn", "error"] }],

      /*
        `no-floating-promises` and `no-misused-promises` are the rules this app
        would benefit from most — an unawaited mutation is the defect class that
        keeps appearing — and both need type information, which means
        `recommendedTypeChecked` and a program per lint run. Noted here so the
        next person does not conclude nobody considered it.
      */
    },
  },
  {
    // Tests may use `any` freely: a fixture that mirrors a Convex document is
    // not made safer by restating 40 fields, and these files never ship.
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];
