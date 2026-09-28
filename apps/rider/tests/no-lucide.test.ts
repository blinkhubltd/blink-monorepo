import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The rider app shares the shop's icon set — Ionicons, through
 * `@repo/mobile-ui/components/ui/icon` — and nothing here or in the shared
 * package imports Lucide.
 *
 * A test rather than trusting package.json for the reason apps/shop's copy
 * gives: the monorepo installs hoisted, so a package any workspace re-adds is
 * resolvable from every app. packages/mobile-ui is scanned too, because a
 * shared component importing Lucide would put it in both apps' bundles.
 */

const APP_ROOT = join(__dirname, "..");
const SHARED_ROOT = join(APP_ROOT, "..", "..", "packages", "mobile-ui", "src");
const SCANNED = [
  ...["app", "components", "lib", "providers"].map((d) => join(APP_ROOT, d)),
  SHARED_ROOT,
];
const EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

function manifest(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
}

describe("apps/rider imports no Lucide", () => {
  const files = SCANNED.flatMap(sourceFiles);

  it("scans a plausible number of files", () => {
    // Guards the guard: a broken walk that finds nothing would make every
    // assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(60);
  });

  it("has no reference to lucide-react-native", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("lucide-react-native"),
    );
    expect(
      offenders,
      "these files import Lucide; use @repo/mobile-ui/components/ui/icon instead",
    ).toEqual([]);
  });

  it("does not declare lucide-react-native as a dependency", () => {
    for (const path of [
      join(APP_ROOT, "package.json"),
      join(SHARED_ROOT, "..", "package.json"),
    ]) {
      const pkg = manifest(path);
      expect(pkg.dependencies?.["lucide-react-native"], path).toBeUndefined();
      expect(pkg.devDependencies?.["lucide-react-native"], path).toBeUndefined();
      expect(pkg.peerDependencies?.["lucide-react-native"], path).toBeUndefined();
    }
  });
});
