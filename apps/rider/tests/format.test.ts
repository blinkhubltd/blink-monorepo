import { describe, expect, it } from "vitest";

import { formatDay } from "../lib/format";

const NOW = new Date(2026, 8, 24, 15, 0).getTime();

describe("formatDay", () => {
  it("leads with Today, and keeps the date", () => {
    expect(formatDay(new Date(2026, 8, 24, 9, 0).getTime(), NOW)).toBe(
      "Today \u00B7 24 Sep 2026",
    );
  });

  it("says Yesterday across midnight, not 'today' within 24 hours", () => {
    expect(formatDay(new Date(2026, 8, 23, 23, 30).getTime(), NOW)).toBe(
      "Yesterday \u00B7 23 Sep 2026",
    );
  });

  it("falls back to the bare date further back", () => {
    expect(formatDay(new Date(2026, 8, 20, 12, 0).getTime(), NOW)).toBe(
      "20 Sep 2026",
    );
  });
});
