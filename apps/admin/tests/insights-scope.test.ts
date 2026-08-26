import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A vendor manager must never see another vendor's figures.
 *
 * The dashboard got this wrong for a long time, and it got it wrong in a way
 * review cannot catch: `data/insights.ts` contains queries that take the vendor
 * scope as an optional CLIENT argument, and others that take no vendor argument
 * at all. Both compile, both return data, and both look completely normal at a
 * call site:
 *
 *     useQuery(api.data.insights.getTotalBlinkRevenue, { timeRange })
 *
 * That line is the whole platform's revenue on a vendor manager's screen. There
 * is no error, no warning, and nothing about it reads as wrong.
 *
 * So this asserts the boundary over the real source, on every run: pages call
 * the scoped modules, and the unscoped ones have no callers left in the app.
 */

const APP = join(__dirname, "..");
const CONVEX = join(APP, "..", "..", "packages", "backend", "convex");

/**
 * Modules whose queries resolve the vendor scope server-side.
 *
 * `resolveScope` reads the caller's own `manager_details.vendor_id`. Their
 * queries accept no vendor argument, so there is nothing for a client to forge.
 */
const SCOPED_MODULES = ["insights_dashboard", "insights_domain"];

/**
 * Queries in `data/insights.ts` that must have NO caller in this app.
 *
 * Each is named with what to use instead, because the failure mode when this
 * test trips is someone reaching for a familiar function name — the replacement
 * needs to be one line away, not one investigation away.
 */
const BANNED: Record<string, string> = {
  getTotalBlinkRevenue:
    "insights_dashboard.getSalesInsights (returns scoped revenue)",
  getRevenueByCategory:
    "insights_domain.getProductsInsights (byCategory, scoped)",
  getOrderStatusDistribution:
    "insights_dashboard.getOperationsInsights (orderStatus, scoped)",
  getRiderPerformance:
    "insights_dashboard.getPerformanceInsights (riders, scoped)",
  getGrowthMetrics:
    "insights_dashboard.getSalesInsights (previous window follows the period)",
  getSalesAnalytics: "insights_dashboard.getSalesInsights",
  getProductPerformance: "insights_domain.getProductsInsights (topProducts)",
  getOrdersSummary: "insights_domain.getOrdersInsights (byVendor, byIndustry)",
  getVendorBreakdown:
    "insights_domain.getIndustriesInsights (vendors, scoped) — the old one took " +
    "a vendorId with no auth check at all",
  getDetailedOrdersInsights: "insights_domain.getOrdersInsights",
  getDetailedShipmentsInsights: "insights_domain.getShipmentsInsights",
  getDetailedProductsInsights: "insights_domain.getProductsInsights",
  getDetailedUsersInsights: "insights_domain.getCustomersInsights",
  getDetailedIndustriesInsights: "insights_domain.getIndustriesInsights",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".turbo") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const sourceFiles = [
  ...walk(join(APP, "app")),
  ...walk(join(APP, "components")),
  ...walk(join(APP, "providers")),
  ...walk(join(APP, "lib")),
];

function readAll(): { path: string; text: string }[] {
  return sourceFiles.map((path) => ({
    path: path.slice(APP.length + 1).replace(/\\/g, "/"),
    text: readFileSync(path, "utf8"),
  }));
}

describe("insights scope", () => {
  it("finds the app source", () => {
    // A walk that silently returns nothing would make every assertion below
    // pass vacuously, which is the failure mode of this whole style of test.
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it("no page calls an unscoped insights query", () => {
    const offences: string[] = [];
    for (const { path, text } of readAll()) {
      for (const [fn, replacement] of Object.entries(BANNED)) {
        if (text.includes(`api.data.insights.${fn}`)) {
          offences.push(`${path} calls ${fn} — use ${replacement}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the scoped queries never accept a vendor id from the client", () => {
    // The distinction that matters. `industryId` and `categoryId` are fine as
    // arguments because they can only NARROW a set already restricted
    // server-side. A vendor id is different: it selects WHOSE data to return, so
    // accepting one from the client hands the choice to the caller.
    for (const moduleName of SCOPED_MODULES) {
      const source = readFileSync(
        join(CONVEX, "data", `${moduleName}.ts`),
        "utf8",
      );
      const args = source.match(/args:\s*\{[^}]*\}/gs) ?? [];
      for (const block of args) {
        expect(
          block.includes('v.id("vendors")'),
          `${moduleName} takes a vendor id as an argument:\n${block}`,
        ).toBe(false);
      }
    }
  });

  it("every scoped query resolves the scope itself", () => {
    for (const moduleName of SCOPED_MODULES) {
      const source = readFileSync(
        join(CONVEX, "data", `${moduleName}.ts`),
        "utf8",
      );
      const exported = [...source.matchAll(/export const (\w+) = query\(/g)].map(
        (m) => m[1]!,
      );
      expect(exported.length).toBeGreaterThan(0);

      // Count handlers against `resolveScope` calls. Every exported query must
      // resolve the scope; one that forgets is the exact bug this file exists to
      // prevent, and it would otherwise return the platform.
      const resolveCalls = source.match(/await resolveScope\(ctx\)/g) ?? [];
      expect(
        resolveCalls.length,
        `${moduleName} exports ${exported.length} queries (${exported.join(", ")}) ` +
          `but calls resolveScope ${resolveCalls.length} times`,
      ).toBe(exported.length);
    }
  });

  it("the vendor payload carries no commercial terms", () => {
    // getInsightsScope returns vendor names so the UI can say what is scoped.
    // The vendor document also carries commission, service_radius and bank
    // details, so returning the document rather than a projection would leak
    // them into a page a vendor manager can open.
    const source = readFileSync(join(CONVEX, "data", "insights_scope.ts"), "utf8");
    for (const field of [
      "commission",
      "service_radius",
      "business_details",
      "account_number",
      "paystack_subaccount_code",
    ]) {
      // Allowed in a comment explaining the omission; not in code.
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect(code.includes(field), `insights_scope.ts references ${field}`).toBe(
        false,
      );
    }
  });
});
