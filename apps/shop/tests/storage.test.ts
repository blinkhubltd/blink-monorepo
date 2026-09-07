import { beforeEach, describe, expect, it, vi } from "vitest";

import { backendFromMmkvModule, type MmkvModule } from "../lib/storage";

/**
 * The adapter from react-native-mmkv's real shape onto this file's own —
 * tested directly, not through `require("react-native-mmkv")` or a mock of
 * the module system.
 *
 * ── Why this test exists ───────────────────────────────────────────────────
 *
 * A real device build's logcat showed `TypeError: undefined cannot be used as
 * a constructor` — `lib/storage.ts` was calling `new MMKV(...)`, a class that
 * `react-native-mmkv` v4 does not export (`MMKV` is exported only as a TYPE,
 * from `src/specs/MMKV.nitro.ts`); construction is `createMMKV(config)`, a
 * factory function (`src/createMMKV/createMMKV.ts`), and removal is
 * `remove(key)`, not `delete(key)` (`src/specs/MMKV.nitro.ts`). The bare
 * `catch {}` around it discarded the real error, so this had been silently
 * falling back to in-memory storage — nothing survives a cold start — on
 * every device that ever ran this build.
 *
 * ── Why a hand-supplied module rather than the real package ────────────────
 *
 * `require("react-native-mmkv")` cannot usefully run under Vitest: Node's
 * strict ESM resolver cannot load the package's own `lib/index.js` build (a
 * pre-existing, unrelated problem in how that package resolves under plain
 * Node — Metro never hits it, resolving the package through its
 * `react-native` field to real TypeScript source instead). `vi.mock` does not
 * help either, because `lib/storage.ts` calls `require` at runtime inside a
 * function rather than as a static `import`, which is what Vitest's mocking
 * actually intercepts — deliberately, per that file's own comment on why the
 * require is not static. Fighting either of those is a worse trade than
 * testing at the real seam: `backendFromMmkvModule` takes the module rather
 * than requiring it, so this test supplies one shaped like the real package
 * (each field cited to its source) and asserts the adapter wires it correctly.
 */
function fakeMmkvModule(): { module: MmkvModule; store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    module: {
      createMMKV: () => ({
        // src/specs/MMKV.nitro.ts:56 `getString(key: string): string | undefined`
        getString: (key) => store.get(key),
        // src/specs/MMKV.nitro.ts:44 `set(key, value: boolean | string | number | ArrayBuffer): void`
        set: (key, value) => void store.set(key, String(value)),
        // src/specs/MMKV.nitro.ts:77 `remove(key: string): boolean`
        remove: (key) => store.delete(key),
        // src/specs/MMKV.nitro.ts:87 `clearAll(): void`
        clearAll: () => store.clear(),
      }),
    },
  };
}

describe("backendFromMmkvModule", () => {
  it("constructs via createMMKV, not `new`", () => {
    const { module } = fakeMmkvModule();
    const spy = vi.fn(module.createMMKV);
    backendFromMmkvModule({ createMMKV: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reads back what it writes", () => {
    const { module } = fakeMmkvModule();
    const backend = backendFromMmkvModule(module);
    backend.set("k", "v");
    expect(backend.getString("k")).toBe("v");
  });

  it("delete() calls the real remove(), not a nonexistent delete()", () => {
    const { module, store } = fakeMmkvModule();
    const backend = backendFromMmkvModule(module);
    backend.set("k", "v");
    backend.delete("k");
    // Proves `delete` reached the fake's `remove` (the only mutator that
    // touches `store` besides `set`) — not a no-op silently swallowed by a
    // missing method.
    expect(store.has("k")).toBe(false);
    expect(backend.getString("k")).toBeUndefined();
  });

  it("clearAll() empties every key", () => {
    const { module } = fakeMmkvModule();
    const backend = backendFromMmkvModule(module);
    backend.set("a", "1");
    backend.set("b", "2");
    backend.clearAll();
    expect(backend.getString("a")).toBeUndefined();
    expect(backend.getString("b")).toBeUndefined();
  });
});

describe("storage", () => {
  beforeEach(() => {
    // lib/storage.ts caches its resolved backend at module scope, so a fresh
    // module per test is what makes `isPersistent()` meaningful more than once.
    vi.resetModules();
  });

  it("degrades to an in-memory backend without persistence, rather than throwing", async () => {
    // Not proof of the fixed code path — `require("react-native-mmkv")`
    // cannot resolve under Vitest at all (see the top-of-file comment), so
    // every test in this describe block exercises the fallback. What it does
    // prove: a broken or unlinked native module degrades the app rather than
    // crashing it, which is the behaviour `lib/storage.ts`'s own module
    // comment states as a requirement.
    const { isPersistent } = await import("../lib/storage");
    expect(isPersistent()).toBe(false);
  });

  it("still sets, reads, removes and round-trips JSON on the fallback", async () => {
    const { setItem, getItem, removeItem, getJSON, setJSON } = await import(
      "../lib/storage"
    );

    setItem("storage-test:probe", "a-value");
    expect(getItem("storage-test:probe")).toBe("a-value");

    removeItem("storage-test:probe");
    expect(getItem("storage-test:probe")).toBeNull();

    expect(getJSON("storage-test:missing", { safe: true })).toEqual({
      safe: true,
    });

    const value = { count: 3, terms: ["a", "b"] };
    setJSON("storage-test:roundtrip", value);
    expect(getJSON("storage-test:roundtrip", null)).toEqual(value);
  });
});
