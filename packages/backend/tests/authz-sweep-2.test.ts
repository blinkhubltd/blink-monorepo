import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Second slice of the wider authorization audit — the admin catalogue-CRUD
 * modules: banners, industries, clearance products, agent zones, clearance
 * batching, product import jobs, and stock alerts.
 *
 * ── The policy, matched to an existing precedent ─────────────────────────
 *
 * `data/products.ts` and `data/categories.ts` already gate only their WRITE
 * mutations and leave catalogue-style reads public — customer apps read the
 * catalogue with no auth, by design. This slice applies that same split
 * rather than inventing a new one: `createBanner`/`updateIndustry`/
 * `clearance_products.create` and friends are gated; `getActiveBanners`,
 * `getActiveIndustries`, `getActiveByCoverage` and their siblings stay open.
 *
 * `agent_zones.ts` is the one exception, gated on reads too — a zone carries
 * commission structure (`fixed_amount`, `install_commission_rate`), which is
 * payout economics, not customer-facing catalogue content.
 *
 * `stock_alerts.getStockAlerts` is a different shape of bug: it took
 * `userRole: v.string()` as a plain argument and string-compared it against an
 * allow-list — forgeable by construction, since the caller supplies the very
 * value being checked.
 */

const CONVEX = join(__dirname, "..", "convex");

function read(...parts: string[]): string {
  return readFileSync(join(CONVEX, ...parts), "utf8").split("\r\n").join("\n");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fnBody(source: string, name: string): string {
  const pattern = new RegExp(
    `export const ${name} = (?:mutation|query|action|internalMutation|internalQuery|internalAction)\\(\\{([\\s\\S]*?)\\n\\}\\);`,
  );
  const match = source.match(pattern);
  expect(match, `${name} not found — has it been renamed?`).not.toBeNull();
  return match![1]!;
}

function argsOf(body: string): string {
  const start = body.indexOf("args:");
  if (start === -1) return "";
  const open = body.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(open + 1, i);
    }
  }
  return "";
}

const banners = stripComments(read("data", "banners.ts"));
const industry = stripComments(read("data", "industry.ts"));
const clearanceProducts = stripComments(read("data", "clearance_products.ts"));
const agentZones = stripComments(read("data", "agent_zones.ts"));
const clearanceBatching = stripComments(read("data", "clearance_batching.ts"));
const importJobs = stripComments(read("data", "import_jobs.ts"));
const stockAlerts = stripComments(read("data", "stock_alerts.ts"));
const paymentFinalization = stripComments(
  read("data", "payment_finalization.ts"),
);

describe("banners.ts", () => {
  it("writes and the admin listing are gated; catalogue reads are not", () => {
    expect(fnBody(banners, "createBanner")).toMatch(
      /assertPermission\(ctx, "banners:CREATE"\)/,
    );
    expect(fnBody(banners, "updateBanner")).toMatch(
      /assertPermission\(ctx, "banners:UPDATE"\)/,
    );
    expect(fnBody(banners, "deleteBanner")).toMatch(
      /assertPermission\(ctx, "banners:DELETE"\)/,
    );
    expect(fnBody(banners, "toggleBannerStatus")).toMatch(
      /assertPermission\(ctx, "banners:UPDATE"\)/,
    );
    expect(fnBody(banners, "getBanners")).toMatch(
      /assertPermission\(ctx, "banners:READ"\)/,
    );
  });

  it("the public marketing reads stay open — same policy as products/categories", () => {
    for (const name of [
      "getActiveBanners",
      "getActiveBannersByCategory",
      "getBannerById",
      "getBannersByCategory",
      "getBannersByProduct",
      "getBannersByBrand",
    ]) {
      expect(fnBody(banners, name), name).not.toMatch(/assertPermission/);
    }
  });
});

describe("industry.ts", () => {
  it("the five writes are gated", () => {
    expect(fnBody(industry, "createIndustry")).toMatch(
      /assertPermission\(ctx, "industries:CREATE"\)/,
    );
    expect(fnBody(industry, "updateIndustry")).toMatch(
      /assertPermission\(ctx, "industries:UPDATE"\)/,
    );
    expect(fnBody(industry, "deleteIndustry")).toMatch(
      /assertPermission\(ctx, "industries:DELETE"\)/,
    );
    expect(fnBody(industry, "updateIndustryStatus")).toMatch(
      /assertPermission\(ctx, "industries:UPDATE"\)/,
    );
    expect(fnBody(industry, "backfillIndustrySearchText")).toMatch(
      /assertPermission\(ctx, "industries:UPDATE"\)/,
    );
  });

  it("getActiveIndustries stays open — a live customer-facing call from apps/shop", () => {
    expect(fnBody(industry, "getActiveIndustries")).not.toMatch(
      /assertPermission/,
    );
    expect(fnBody(industry, "getAllIndustries")).not.toMatch(
      /assertPermission/,
    );
    expect(fnBody(industry, "getIndustryById")).not.toMatch(
      /assertPermission/,
    );
  });
});

describe("clearance_products.ts", () => {
  it("create, update and deactivate are gated", () => {
    expect(fnBody(clearanceProducts, "create")).toMatch(
      /assertPermission\(ctx, "clearance:CREATE"\)/,
    );
    expect(fnBody(clearanceProducts, "update")).toMatch(
      /assertPermission\(ctx, "clearance:UPDATE"\)/,
    );
    expect(fnBody(clearanceProducts, "deactivate")).toMatch(
      /assertPermission\(ctx, "clearance:UPDATE"\)/,
    );
  });

  it("getActiveByCoverage stays open — the shop clearance screen's own query", () => {
    expect(fnBody(clearanceProducts, "getActiveByCoverage")).not.toMatch(
      /assertPermission/,
    );
  });
});

describe("agent_zones.ts — gated on reads too, unlike the catalogue modules", () => {
  it("a zone carries commission structure, not customer-facing content", () => {
    const body = fnBody(agentZones, "updateZone");
    expect(argsOf(body)).toMatch(/fixed_amount: v\.optional/);
    expect(argsOf(body)).toMatch(/install_commission_rate: v\.optional/);
  });

  it("every write is gated", () => {
    expect(fnBody(agentZones, "createZone")).toMatch(
      /assertPermission\(ctx, "agents:CREATE"\)/,
    );
    expect(fnBody(agentZones, "updateZone")).toMatch(
      /assertPermission\(ctx, "agents:UPDATE"\)/,
    );
    expect(fnBody(agentZones, "deleteZone")).toMatch(
      /assertPermission\(ctx, "agents:DELETE"\)/,
    );
  });

  it("the live-called reads are gated too", () => {
    expect(fnBody(agentZones, "getZones")).toMatch(
      /assertPermission\(ctx, "agents:READ"\)/,
    );
    expect(fnBody(agentZones, "getAllZones")).toMatch(
      /assertPermission\(ctx, "agents:READ"\)/,
    );
  });

  it("the two with no caller are internal instead", () => {
    expect(agentZones).toMatch(/export const getZone = internalQuery\(/);
    expect(agentZones).toMatch(
      /export const countAgentsInZone = internalQuery\(/,
    );
  });
});

describe("clearance_batching.ts is internal, matching its already-internal siblings", () => {
  it("both public exports became internal", () => {
    for (const name of ["addOrderToBatch", "createAndDispatchBatch"]) {
      expect(clearanceBatching, name).toMatch(
        new RegExp(`export const ${name} = internalMutation\\(`),
      );
      expect(clearanceBatching, name).not.toMatch(
        new RegExp(`export const ${name} = mutation\\(`),
      );
    }
  });

  it("the only caller reaches them through internal, not api", () => {
    expect(paymentFinalization).not.toMatch(
      /api\.data\.clearance_batching\./,
    );
    expect(paymentFinalization).toMatch(
      /internal\.data\.clearance_batching\.addOrderToBatch/,
    );
    expect(paymentFinalization).toMatch(
      /internal\.data\.clearance_batching\.createAndDispatchBatch/,
    );
  });
});

describe("import_jobs.ts", () => {
  it("createImportJob and getImportJob are gated", () => {
    expect(fnBody(importJobs, "createImportJob")).toMatch(
      /assertPermission\(ctx, "products:CREATE"\)/,
    );
    expect(fnBody(importJobs, "getImportJob")).toMatch(
      /assertPermission\(ctx, "products:READ"\)/,
    );
  });

  it("the one with no caller is internal", () => {
    expect(importJobs).toMatch(
      /export const getRecentImportJobs = internalQuery\(/,
    );
  });
});

describe("stock_alerts.ts", () => {
  it("getStockAlerts no longer trusts a client-supplied role string", () => {
    const body = fnBody(stockAlerts, "getStockAlerts");
    expect(argsOf(body)).not.toMatch(/userRole/);
    expect(body).toMatch(/hasPermission\(ctx, "products:READ"\)/);
    // The old allow-list is gone with it — the caller could no longer forge
    // membership in it even if it were still here, but it should not be.
    expect(body).not.toMatch(/"HUB MANAGER"|"GENERAL MANAGER"/);
  });

  it("a caller without the permission still gets showAlerts: false, not a thrown error", () => {
    // hasPermission over assertPermission was the deliberate choice — the
    // dashboard component never handled a query throwing.
    const body = fnBody(stockAlerts, "getStockAlerts");
    expect(body).toMatch(/showAlerts: false/);
    expect(body).not.toMatch(/assertPermission/);
  });

  it("the unauthenticated duplicate is internal", () => {
    expect(stockAlerts).toMatch(
      /export const getLowStockProducts = internalQuery\(/,
    );
  });
});
