import { listExpiredUnpaidBookings, releaseUnpaidBooking } from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";

/**
 * The expiry sweeper (plan §4: "Expiry sweeper (Cron Trigger, 15 min):
 * awaiting_payment bookings past expiry -> cancel + free capacity"), driven by
 * the every-15-minutes trigger in wrangler.jsonc via custom-worker.ts's
 * scheduled() handler. (The cron expression is not written out here: it
 * contains a slash-star sequence that would terminate this block comment.)
 *
 * This is a BACKSTOP, not the primary mechanism. Stripe already tells us when
 * a session expires and the webhook (5c) releases the seat on that event --
 * which is faster and more precise. The sweeper exists for the case where that
 * delivery never lands: an outage, a misconfigured destination, a bad deploy.
 * Without it, one missed webhook holds a seat until a human notices.
 *
 * Takes `env` explicitly: scheduled() has no request, so getDb()/
 * getCloudflareContext() throw here (see queries/notifications.ts's module
 * comment). Everything it calls accepts a db override for that reason.
 */

export interface ExpirySweepResult {
  cutoff: number;
  found: number;
  released: number;
  skipped: number;
  failed: number;
}

/**
 * Grace period after a booking's own payment deadline before the sweeper
 * releases it.
 *
 * Each booking now carries payment_expires_at, frozen from the exact
 * expires_at Stripe itself will enforce (see migration 0015 / Audit A3), so
 * the old drift -- sweeper cutoff computed from the current holdMinutes vs each
 * session's frozen hold -- is gone: we sweep on the same instant Stripe expires
 * the session. The margin is no longer load-bearing for correctness (it used to
 * paper over a created_at-vs-session-creation gap); it survives only as backstop
 * politeness -- waiting a few minutes past Stripe's expiry before reclaiming,
 * since the checkout.session.expired webhook is the prompt primary path and
 * being slightly late costs nothing while being early is a money bug.
 *
 * Raised 300 -> 1800 after review. 300s was the same order of magnitude as
 * Stripe's own webhook retry backoff, which makes it a real money window rather
 * than politeness: status/payment_status only move when the webhook lands, and
 * this route deliberately answers 409 on an in-flight claim to FORCE a retry.
 * So a guest paying near the deadline whose first delivery fails (deploy, blip)
 * can be swept before the retry arrives -- the booking is cancelled, its seat
 * released and resold, and the late webhook then finds nothing to mark paid.
 * That the webhook already carries a dedicated payment_received_after_release
 * branch shows this outcome was detected but not prevented. 1800s sits well
 * past Stripe's early retries while staying far inside the shortest sensible
 * hold, and the asymmetry the paragraph above states still governs: being late
 * costs an idle seat for a few minutes, being early costs a paid booking.
 */
const SWEEP_MARGIN_SECONDS = 1800;

export async function runExpirySweep(env: CloudflareEnv, now: Date = new Date()): Promise<ExpirySweepResult> {
  const db = env.DB;

  // Release rows whose frozen payment deadline passed at least a margin ago.
  const cutoff = Math.floor(now.getTime() / 1000) - SWEEP_MARGIN_SECONDS;
  const due = await listExpiredUnpaidBookings(cutoff, db);

  const result: ExpirySweepResult = { cutoff, found: due.length, released: 0, skipped: 0, failed: 0 };

  for (const booking of due) {
    let released: boolean;
    try {
      // Guarded internally: a booking that paid or was confirmed between the
      // SELECT above and this write is left alone. That gap is real -- the
      // list is a plain read -- which is exactly why the guard lives in the
      // write rather than in this loop.
      released = await releaseUnpaidBooking(booking.id, db);
    } catch (err) {
      // One bad row must not strand every other held seat -- same per-booking
      // isolation as the notification cron's processBatch.
      console.error(`expiry-sweep: failed to release booking ${booking.id}`, err);
      result.failed++;
      continue;
    }
    if (!released) {
      result.skipped++;
      continue;
    }
    result.released++;
    // The seat is already freed; a failing audit-log write must not re-count
    // this as `failed` (which reads as "seat not freed") -- log it separately.
    // (Audit A29.)
    try {
      await logBookingEvent(booking.id, "system", "expired_unpaid", { swept_at: Math.floor(now.getTime() / 1000) }, db);
    } catch (err) {
      console.error(`expiry-sweep: released booking ${booking.id} but failed to log it`, err);
    }
  }

  return result;
}
