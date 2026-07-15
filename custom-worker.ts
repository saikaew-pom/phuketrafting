// @ts-ignore — .open-next/worker.js is generated at build time
import handler from "./.open-next/worker.js";
import { runScheduledNotifications } from "./src/lib/cron/scheduled-notifications";

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

      // Booking-expiry sweep -- Phase 5 (Stripe). Deliberately a no-op until
      // there are `awaiting_payment` bookings to expire; see wrangler.jsonc.
      case "*/15 * * * *":
        break;

      default:
        console.warn("unhandled cron trigger:", event.cron);
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Required because the DO bindings live in the generated worker module.
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
