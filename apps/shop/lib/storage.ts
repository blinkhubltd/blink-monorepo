/**
 * Key-value storage, behind a deliberately tiny interface.
 *
 * ── Why an interface rather than importing MMKV directly ──────────────────
 *
 * `react-native-mmkv` is the highest-risk dependency in this app's upgrade.
 * v3+ is a Nitro module: it needs `react-native-nitro-modules`, it is
 * new-architecture only, and its API changed from the 2.x the previous app
 * pinned. Whether it links cleanly on both platforms is a question only a real
 * device build answers, so everything the app persists goes through these four
 * functions and swapping the backend is a change to this file alone
 * (`expo-sqlite/kv-store` is the fallback).
 *
 * ── That API change, made concrete ────────────────────────────────────────
 *
 * v4 has no `MMKV` class to `new` — it is exported only as a TYPE, from
 * `react-native-mmkv/src/specs/MMKV.nitro.ts`. Construction is
 * `createMMKV(config)`, a factory function, and the removal method is
 * `remove(key)`, not `delete(key)`. A real device build's logcat showed
 * `TypeError: undefined cannot be used as a constructor` — the exact shape of
 * `new (undefined as any)(...)` — which is what first pinned this down: not a
 * native-linking failure at all, despite the message below saying so. The
 * `catch` here used to discard the real error entirely, which is what let a
 * plain API mismatch masquerade as a linking problem for as long as it did.
 *
 * ── Why the fallback is loud ──────────────────────────────────────────────
 *
 * blink-ecommerce wrapped `require("react-native-mmkv")` in a try/catch with a
 * silent in-memory `Map` fallback. That is worse than a crash: a broken native
 * module looks like a working app that quietly forgets the cart between
 * launches, and nobody files that bug because nobody can reproduce it. The
 * suspicion that it was *already* failing somewhere is part of why it is being
 * replaced.
 *
 * So the fallback still exists — a storage failure should not prevent browsing —
 * but it warns once, and `isPersistent()` lets callers that genuinely need
 * durability check rather than assume.
 *
 * Synchronous by design: the cart badge reads on mount, and an async read there
 * means the count visibly pops in a frame late on every launch.
 */

type Backend = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  clearAll(): void;
};

let backend: Backend | null = null;
let persistent = false;
let warned = false;

function memoryBackend(): Backend {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
    clearAll: () => map.clear(),
  };
}

function warnOnce(cause: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    "[storage] MMKV unavailable; using in-memory storage. Nothing will survive " +
      "a cold start. This is a native linking problem, not a runtime condition — " +
      "check that react-native-mmkv and react-native-nitro-modules are built " +
      "into this binary.",
    // The actual thrown error, not just this generic diagnosis. Without it,
    // "unavailable" could mean the native module truly isn't linked, or that
    // linking succeeded but construction threw for an unrelated reason — those
    // need different fixes, and swallowing the cause makes them indistinguishable.
    cause,
  );
}

/** The one export `require("react-native-mmkv")` needs to provide. */
export type MmkvModule = {
  createMMKV: (config?: { id?: string }) => {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
    clearAll(): void;
  };
};

/**
 * The adapter from react-native-mmkv's shape to this file's own.
 *
 * Exported and pure — takes the already-`require`d module rather than calling
 * `require` itself — specifically so it is directly testable. `require`'s own
 * resolution of the real package cannot usefully run under Vitest: Node's
 * strict ESM resolver cannot load the package's own `lib/index.js` build (an
 * unrelated, pre-existing problem in how that package resolves under plain
 * Node — Metro never hits it, since it resolves the package through its
 * `react-native` field instead), so a test exercising `require("react-native-mmkv")`
 * itself would be testing that unrelated Node/npm mismatch rather than this
 * file's own logic. This function is what was actually wrong before: `new
 * MMKV(...)` where v4 has no constructor to `new`, and `.delete()` where the
 * real method is `.remove()`. Testing this directly, with a hand-supplied
 * module shaped like the real one, catches exactly that class of mistake
 * without needing the real package to load in a Node test environment at all.
 */
export function backendFromMmkvModule(mod: MmkvModule): Backend {
  const mmkv = mod.createMMKV({ id: "blink-shop" });
  return {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
    // Adapted to this file's own `delete` name here, rather than renaming
    // `Backend` and every caller of `removeItem`.
    delete: (key) => void mmkv.remove(key),
    clearAll: () => mmkv.clearAll(),
  };
}

function resolveBackend(): Backend {
  if (backend) return backend;

  try {
    // Required lazily so an unlinked native module degrades instead of taking
    // the whole bundle down at import time.
    backend = backendFromMmkvModule(require("react-native-mmkv") as MmkvModule);
    persistent = true;
  } catch (cause) {
    warnOnce(cause);
    backend = memoryBackend();
    persistent = false;
  }

  return backend;
}

/** Whether writes actually survive a cold start. False means the fallback is live. */
export function isPersistent(): boolean {
  resolveBackend();
  return persistent;
}

export function getItem(key: string): string | null {
  try {
    return resolveBackend().getString(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    resolveBackend().set(key, value);
  } catch {
    // A failed write is survivable; the caller's state is still correct in
    // memory for this session.
  }
}

export function removeItem(key: string): void {
  try {
    resolveBackend().delete(key);
  } catch {
    // Ignore.
  }
}

/**
 * Read and parse JSON, returning `fallback` on anything unexpected.
 *
 * Storage holds data written by *older versions of this app*, so a shape that
 * no longer parses is a normal event on upgrade, not a bug. Callers get their
 * default rather than a thrown error mid-render.
 */
export function getJSON<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or superseded. Drop it so it stops being re-read every launch.
    removeItem(key);
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  try {
    setItem(key, JSON.stringify(value));
  } catch {
    // Unserialisable value — a caller bug, but not one worth crashing a screen
    // over.
  }
}

/** Storage keys, declared in one place so a typo cannot silently orphan data. */
export const StorageKeys = {
  /** Guest cart: product ids and quantities only. Never prices — see CartProvider. */
  guestCart: "shop:guestCart:v1",
  /** Last known delivery point, so the catalogue can render before GPS resolves. */
  location: "shop:location:v1",
  /** The last few search terms. Convenience only: losing them costs nothing. */
  recentSearches: "shop:recentSearches:v1",
  /**
   * An agent code recovered from Google Play's Install Referrer API, held
   * until a signed-in session exists to submit it to `attributeMyInstall`.
   * See `lib/use-install-attribution.ts`. Android only; never written on iOS.
   */
  pendingInstallCode: "shop:pendingInstallCode:v1",
  /**
   * Whether the Install Referrer API has been queried at all, ever. Google's
   * own guidance is to call it once, shortly after install — not on every
   * launch — and the referrer value cannot change after the fact regardless,
   * so a second query only wastes a call. Set even when no code was found, so
   * an organic install does not get queried again on every cold start.
   */
  installReferrerChecked: "shop:installReferrerChecked:v1",
} as const;
