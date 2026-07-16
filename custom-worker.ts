// @ts-ignore — .open-next/worker.js is generated at build time
import handler from "./.open-next/worker.js";
import { runScheduledNotifications } from "./src/lib/cron/scheduled-notifications";
import { runExpirySweep } from "./src/lib/cron/expiry-sweeper";
import { generateSessions } from "./src/lib/session-generator";

export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    switch (event.cron) {
      // Daily guest notifications: T-1 pre-arrival pickup confirmation and
      // T+1 thank-you (plan §2). Note this runs at 01:00 UTC = 08:00 in
      // Thailand, so "tomorrow" is computed in ICT, not UTC -- see
      // thailandDateOffset.
      case "0 1 * * *": {
        // waitUntil, not a bare await: the runtime can otherwise tear the
        // invocation down as soon as scheduled() resolves, and this loop does
        // real network I/O per booking.
        ctx.waitUntil(
          runScheduledNotifications(env)
            .then((result) => {
              // Plan §2 wants these "throttled/logged like all notifications".
              // Per-booking outcomes are on the booking row itself
              // (pre_arrival_status/thank_you_status, visible in the
              // dashboard); this line is the run-level record, which is all
              // `wrangler tail`/observability can give us.
              console.log("scheduled-notifications:", JSON.stringify(result));
            })
            .catch((err) => {
              // A throw here would be an unhandled rejection inside
              // waitUntil, which surfaces as an opaque runtime error rather
              // than something diagnosable. Individual sends already handle
              // their own failures (see processBatch); this only catches a
              // failure of the batch machinery itself, e.g. D1 being down.
              console.error("scheduled-notifications failed", err);
            })
        );

        // Rolls the bookable window forward one day (lib/session-generator.ts).
        // Shares this trigger rather than adding a third cron: it's daily
        // maintenance on the same cadence, and it's idempotent, so a missed or
        // doubled run is harmless -- the next one simply fills the gap.
        // Deliberately its own waitUntil: a notification failure must not stop
        // the calendar from being generated, and vice versa.
        ctx.waitUntil(
          generateSessions(env.DB)
            .then((result) => {
              // Only log real work: on a steady-state day this creates exactly
              // one new day's departures, and "created:0" every morning would
              // be noise -- but created:0 with templates configured means the
              // window has stopped moving, which is worth seeing.
              if (result.created > 0) console.log("session-generator:", JSON.stringify(result));
            })
            .catch((err) => {
              // Loud: if this keeps failing, the booking calendar quietly runs
              // dry ~120 days later and the site shows "No open dates".
              console.error("session-generator failed", err);
            })
        );
        break;
      }

      // Booking-expiry sweep (plan §4). Backstop for a missed
      // checkout.session.expired webhook -- see lib/cron/expiry-sweeper.ts.
      case "*/15 * * * *": {
        ctx.waitUntil(
          runExpirySweep(env)
            .then((result) => {
              // Only log when it actually did something: this fires 96x/day
              // and a "found:0" line every 15 minutes would bury the runs that
              // matter under noise.
              if (result.found > 0) console.log("expiry-sweep:", JSON.stringify(result));
            })
            .catch((err) => {
              console.error("expiry-sweep failed", err);
            })
        );
        break;
      }

      default:
        console.warn("unhandled cron trigger:", event.cron);
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Required because the DO bindings live in the generated worker module.
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
