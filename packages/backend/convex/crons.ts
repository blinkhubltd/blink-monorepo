import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs.
 *
 * ── Conventions (sydia) ───────────────────────────────────────────────────
 *
 *   - Job names are kebab-case.
 *   - Every job carries a comment saying what it does **and the local-time
 *     equivalent of the UTC schedule**. Kenya is EAT (UTC+3), no DST.
 *   - Targets are always `internal.*`. A cron target has no business being
 *     callable by a client.
 *   - Hourly jobs stagger their `minuteUTC` rather than all firing on :00.
 *
 * ── What changed ──────────────────────────────────────────────────────────
 *
 * Two of the four jobs pointed at `api.*` rather than `internal.*`, in a 35-line
 * file that used `internal.*` correctly for the other two. Those two targets
 * (`userNotifications.scheduleNotificationCleanup` and
 * `stockReservation.cleanupExpiredReservations`) have **zero callers in any app**
 * — the cron was their only caller — so converting them to `internalMutation`
 * costs nothing and removes two publicly-callable table sweeps.
 *
 * The `api`/`internal` imports were also two separate statements from the same
 * module; now one.
 *
 * ── Missing coverage, deliberately not added yet ──────────────────────────
 *
 * There is no job reconciling stuck `Pending` payments or orphaned `Pending`
 * orders, and no reaper for `import_jobs` rows left in `processing` — those can
 * hang forever. Both are real gaps, but adding them means deciding what "stuck"
 * means and what to do about it, which is a product question, not a scheduling
 * one.
 */

const crons = cronJobs();

// Delete read/expired in-app notifications. 02:00 UTC = 05:00 EAT, before the
// morning delivery peak.
crons.daily(
  "notification-cleanup",
  { hourUTC: 2, minuteUTC: 0 },
  internal.data.user_notifications.scheduleNotificationCleanup,
);

// Release stock held by carts that never checked out, so inventory is not
// stranded. Runs at :07 to stay clear of the clearance sweep at :30.
crons.hourly(
  "stock-reservation-cleanup",
  { minuteUTC: 7 },
  internal.data.stock_reservation.cleanupExpiredReservations,
);

// Expire clearance listings past their window.
crons.hourly(
  "clearance-expiry",
  { minuteUTC: 30 },
  internal.data.clearance_products.expireListings,
);

// Credit fixed-amount weekly earnings to agents in "fixed" zones.
// Monday 00:00 UTC = Monday 03:00 EAT. This job moves money — it is the only
// scheduled job that does, so treat any failure here as an incident.
crons.weekly(
  "agent-fixed-zone-payout",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.data.marketing.creditWeeklyFixedEarnings,
);

export default crons;
