import { describe, expect, it } from "vitest";

import {
  averageDropMs,
  averageFee,
  clockTo,
  dropBy,
  formatDuration,
  lastDays,
  PROMISE_MINUTES,
  sparkHeights,
  startOfWeek,
  targetPlan,
  thisMonthByWeek,
  thisWeekByDay,
  weekOverWeekPct,
  type RiderJob,
} from "../lib/earnings";

// Wednesday 23 September 2026, 14:00 local. Sunday 20th starts the week.
const NOW = new Date(2026, 8, 23, 14, 0).getTime();
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();

function job(overrides: Partial<RiderJob>): RiderJob {
  return {
    id: "s",
    reference: "1234567890",
    status: "Delivered",
    live: false,
    addressLine: "Riverside Drive",
    coordinates: null,
    customerName: null,
    assignedAt: at(23, 11, 50),
    updatedAt: at(23, 12),
    completedAt: at(23, 12),
    orderDate: at(23, 11, 45),
    total: 1000,
    fee: 200,
    rating: null,
    paymentMethod: null,
    ...overrides,
  };
}

describe("startOfWeek", () => {
  it("is the Sunday before, at midnight — the design's week runs Sun–Sat", () => {
    expect(new Date(startOfWeek(NOW)).getDay()).toBe(0);
    expect(new Date(startOfWeek(NOW)).getDate()).toBe(20);
    expect(new Date(startOfWeek(NOW)).getHours()).toBe(0);
  });
});

describe("lastDays / sparkHeights", () => {
  const jobs = [
    job({ completedAt: at(23), fee: 300 }),
    job({ completedAt: at(23), fee: 100 }),
    job({ completedAt: at(21), fee: 200 }),
    job({ completedAt: null, live: true, status: "Picked Up", fee: 999 }),
  ];

  it("sums fees per day, oldest first, today last", () => {
    expect(lastDays(jobs, NOW, 7, "fee")).toEqual([0, 0, 0, 0, 200, 0, 400]);
  });

  it("counts the same days, and never counts a live job", () => {
    expect(lastDays(jobs, NOW, 7, "count")).toEqual([0, 0, 0, 0, 1, 0, 2]);
  });

  it("scales against the tallest bar with a visible floor", () => {
    expect(sparkHeights([0, 200, 400])).toEqual([8, 50, 100]);
  });

  it("draws stubs, not nothing, for an empty week", () => {
    expect(sparkHeights([0, 0, 0])).toEqual([8, 8, 8]);
  });
});

describe("weekOverWeekPct", () => {
  it("compares the last seven days with the seven before", () => {
    const jobs = [
      job({ completedAt: at(23), fee: 600 }), // this window
      job({ completedAt: at(12), fee: 500 }), // previous window
    ];
    expect(weekOverWeekPct(jobs, NOW)).toBe(20);
  });

  it("is null with nothing to compare against, rather than +Infinity%", () => {
    expect(weekOverWeekPct([job({})], NOW)).toBeNull();
  });
});

describe("averageDropMs / formatDuration", () => {
  it("averages assignment to delivery across the last week", () => {
    const jobs = [
      job({ assignedAt: at(23, 12, 0), completedAt: at(23, 12, 8) }),
      job({ assignedAt: at(22, 12, 0), completedAt: at(22, 12, 10) }),
      // Outside the seven-day window — ignored.
      job({ assignedAt: at(1, 12, 0), completedAt: at(1, 13, 0) }),
    ];
    expect(averageDropMs(jobs, NOW)).toBe(9 * 60 * 1000);
  });

  it("is null with nothing delivered, rather than 0 min", () => {
    expect(averageDropMs([], NOW)).toBeNull();
  });

  it("reads like the design", () => {
    expect(formatDuration(520_000)).toBe("8 min 40 s");
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(8 * 60_000)).toBe("8 min");
    expect(formatDuration(65 * 60_000)).toBe("1 h 5 min");
  });
});

describe("thisWeekByDay", () => {
  it("runs Sunday to Saturday and marks today and the days still to come", () => {
    const days = thisWeekByDay([job({ completedAt: at(22), fee: 250 })], NOW);
    expect(days.map((d) => d.label)).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
    expect(days[2]!.value).toBe(250);
    expect(days[3]!.isToday).toBe(true);
    expect(days.filter((d) => d.future).map((d) => d.label)).toEqual([
      "Thu", "Fri", "Sat",
    ]);
  });
});

describe("thisMonthByWeek", () => {
  it("buckets by calendar day, folding the tail of the month into week four", () => {
    const weeks = thisMonthByWeek(
      [
        job({ completedAt: at(3) }),
        job({ completedAt: at(9) }),
        job({ completedAt: at(23) }),
        job({ completedAt: at(30) }),
      ],
      NOW,
    );
    expect(weeks.map((w) => w.count)).toEqual([1, 1, 0, 2]);
    // September has 30 days, so the last bucket is 22nd–30th.
    expect(weeks.map((w) => w.days)).toEqual([7, 7, 7, 9]);
  });
});

describe("targetPlan", () => {
  const jobs = [
    job({ completedAt: at(21), fee: 2000 }),
    job({ completedAt: at(22), fee: 3000 }),
  ];

  it("turns what is left into deliveries a day, today included", () => {
    const plan = targetPlan(10_000, jobs, NOW);
    expect(plan.earned).toBe(5000);
    expect(plan.remaining).toBe(5000);
    expect(plan.daysLeft).toBe(4); // Wed, Thu, Fri, Sat
    expect(plan.daysLabel).toBe("Wed–Sat");
    // Average fee 2,500; 5,000 over 4 days is 1,250 a day, so one delivery.
    expect(plan.perDay).toBe(1);
    expect(plan.pct).toBe(50);
    expect(plan.hit).toBe(false);
  });

  it("reports a cleared target instead of a negative remainder", () => {
    const plan = targetPlan(4000, jobs, NOW);
    expect(plan.hit).toBe(true);
    expect(plan.remaining).toBe(0);
    expect(plan.pct).toBe(100);
  });

  it("gives no pace without a delivery history to take a rate from", () => {
    expect(targetPlan(10_000, [], NOW).perDay).toBeNull();
  });

  it("uses a single day's name on Saturday", () => {
    expect(targetPlan(10_000, jobs, at(26, 9)).daysLabel).toBe("Sat");
  });
});

describe("averageFee", () => {
  it("only looks at the last thirty days", () => {
    const old = new Date(2026, 6, 1).getTime();
    expect(
      averageFee([job({ fee: 300 }), job({ completedAt: old, fee: 9000 })], NOW),
    ).toBe(300);
  });
});

describe("dropBy / clockTo", () => {
  it("is the brand promise after the order was placed", () => {
    expect(dropBy(at(23, 14))).toBe(at(23, 14) + PROMISE_MINUTES * 60_000);
    expect(dropBy(null)).toBeNull();
  });

  it("counts down, then reports lateness rather than sticking at zero", () => {
    expect(clockTo(NOW + 125_000, NOW)).toEqual({ label: "2:05", late: false });
    expect(clockTo(NOW - 185_000, NOW)).toEqual({ label: "3:05", late: true });
  });
});
