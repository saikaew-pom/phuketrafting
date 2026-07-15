// @ts-ignore — .open-next/worker.js is generated at build time
import handler from "./.open-next/worker.js";
import { runScheduledNotifications } from "./src/lib/cron/scheduled-notifications";
import { runExpirySweep } from "./src/lib/cron/expiry-sweeper";

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
