import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source scan, not a render test.
 *
 * `contentContainerClassName` on a FlashList is a string NativeWind never
 * reads unless the component has been registered — and a dropped class string
 * is not an error anywhere: it type-checks, it renders, and the padding is
 * simply absent. That is how ten screens ended up edge-to-edge without anyone
 * noticing. Nothing at runtime can catch the regression either, so the check
 * lives here.
 */

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".expo") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = [
  ...sourceFiles(join(ROOT, "app")),
  ...sourceFiles(join(ROOT, "components")),
  ...sourceFiles(join(ROOT, "lib")),
];

/** The nearest opening tag above an index is the element the prop sits on. */
function owningElement(source: string, index: number): string {
  const tags = [...source.slice(0, index).matchAll(/<([A-Z]\w*)/g)];
  return tags.at(-1)?.[1] ?? "";
}

describe("FlashList NativeWind registration", () => {
  it("registers FlashList itself", () => {
    const source = readFileSync(join(ROOT, "lib/flashlist-interop.ts"), "utf8");
    expect(source).toMatch(/remapProps\(\s*FlashList/);
    expect(source).toContain("contentContainerClassName");
  });

  it("runs that registration from the root layout, before any screen renders", () => {
    const layout = readFileSync(join(ROOT, "app/_layout.tsx"), "utf8");
    expect(layout).toMatch(/import "\.\.\/lib\/flashlist-interop";/);
  });

  it("registers every animated FlashList wrapper too", () => {
    // `createAnimatedComponent` produces a DIFFERENT component, and NativeWind
    // keys registrations by identity — so a wrapper silently opts back out of
    // the fix unless it is registered in its own right.
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      const match =
        /const (\w+) = Animated\.createAnimatedComponent\(\s*FlashList/.exec(source);
      if (!match) continue;
      expect(
        source,
        `${file} wraps FlashList but never calls remapProps on the wrapper`,
      ).toMatch(new RegExp(String.raw`remapProps\(\s*` + match[1]));
    }
  });

  it("uses ItemSeparatorComponent rather than gap in a FlashList content container", () => {
    // Items are absolutely positioned inside FlashList's own collection view,
    // so `gap` on the content container does nothing — it would look like the
    // class was being dropped all over again. Only FlashList is affected: a
    // ScrollView's content container is an ordinary flex box, and orders.tsx
    // relies on exactly that.
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/contentContainerClassName="([^"]*)"/g)) {
        const owner = owningElement(source, match.index);
        if (!owner.includes("FlashList")) continue;
        expect(
          match[1],
          `${file}: gap in a ${owner} content container`,
        ).not.toMatch(/\bgap-/);
      }
    }
  });
});
