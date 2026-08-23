import { cronJobs } from "convex/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired notifications daily at 2 AM
crons.daily(
  "Daily notification cleanup",
  { hourUTC: 2, minuteUTC: 0 },
  api.userNotifications.scheduleNotificationCleanup,
);

// Clean up expired stock reservations every hour
crons.hourly(
  "Hourly stock reservation cleanup",
  { minuteUTC: 0 },
  api.stockReservation.cleanupExpiredReservations,
);

// Expire clearance product listings every hour
crons.hourly(
  "Hourly clearance expiry check",
  { minuteUTC: 30 },
  internal.clearanceProducts.expireListings,
);

// Credit fixed-amount earnings to all agents in "fixed" zones every Monday at 00:00 UTC
crons.weekly(
  "Weekly fixed zone payout",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.marketing.creditWeeklyFixedEarnings,
);

export default crons;
