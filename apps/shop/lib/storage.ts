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

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "[storage] MMKV unavailable; using in-memory storage. Nothing will survive " +
      "a cold start. This is a native linking problem, not a runtime condition — " +
      "check that react-native-mmkv and react-native-nitro-modules are built " +
      "into this binary.",
  );
}

function resolveBackend(): Backend {
  if (backend) return backend;

  try {
    // Required lazily so an unlinked native module degrades instead of taking
    // the whole bundle down at import time.
    const { MMKV } = require("react-native-mmkv") as {
      MMKV: new (config?: { id?: string }) => Backend;
    };
    backend = new MMKV({ id: "blink-shop" });
    persistent = true;
  } catch {
    warnOnce();
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
} as const;
