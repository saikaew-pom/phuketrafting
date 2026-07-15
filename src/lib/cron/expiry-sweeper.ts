import { listExpiredUnpaidBookings, releaseUnpaidBooking } from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";
import { getPaymentPolicy, DEFAULT_PAYMENT_POLICY } from "@/lib/queries/settings";

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
  holdMinutes: number;
  found: number;
  released: number;
  skipped: number;
  failed: number;
}

/**
 * Extra seconds a booking must be overdue before the sweeper will touch it.
 *
 * holdMinutes alone is NOT enough, because the two clocks it anchors are not
 * the same instant. Stripe expires a session at SESSION creation + hold, but
 * this sweeper cuts at BOOKING created_at + hold -- and the booking row is
 * always inserted first, with the session opened `d` seconds later (one D1
 * read for the product name, one for the policy, then the Stripe round-trip:
 * ~1-2s typically, up to ~16s in the worst case that payments.ts allows via
 * its 8s timeout plus one retry).
 *
 * So Stripe's expiry is ALWAYS `d` seconds later than this cutoff, and a
 * cron tick landing in that window cancels a booking whose payment page is
 * still open and payable -- the guest pays, markBookingPaid finds a
 * non-awaiting_payment row and silently no-ops, and they have paid for
 * nothing. That is the exact failure this whole chunk exists to prevent;
 * without a margin it is merely narrowed from 24h to a few seconds rather
 * than closed. (Verified against live Stripe: a sweep one second before a
 * real session's expires_at released the seat while the session was still
 * status=open with a live url.)
 *
 * 300s is far wider than any plausible `d` and costs nothing real, because
 * this sweeper is only a BACKSTOP: the checkout.session.expired webhook
 * already releases the seat promptly in the normal case. Being late is
 * harmless; being early is a money bug. When the webhook has genuinely
 * failed, five extra minutes on a already-missed release is irrelevant.
 */
const SWEEP_MARGIN_SECONDS = 300;

export async function runExpirySweep(env: CloudflareEnv, now: Date = new Date()): Promise<ExpirySweepResult> {
  const db = env.DB;

  // The SAME number that set each session's expires_at when it was created
  // (lib/checkout.ts), so the two can never drift. Falls back to the default
  // if the settings read fails: a sweeper that silently stops reclaiming
  // seats is worse than one using a sane default, and the default is what
  // checkout.ts falls back to as well, so the two still agree.
  let holdMinutes = DEFAULT_PAYMENT_POLICY.holdMinutes;
  try {
    holdMinutes = (await getPaymentPolicy(db)).holdMinutes;
  } catch (err) {
    console.error("expiry-sweep: could not read payment policy, using default hold", err);
  }

  const cutoff = Math.floor(now.getTime() / 1000) - holdMinutes * 60 - SWEEP_MARGIN_SECONDS;
  const due = await listExpiredUnpaidBookings(cutoff, db);

  const result: ExpirySweepResult = { cutoff, holdMinutes, found: due.length, released: 0, skipped: 0, failed: 0 };

  for (const booking of due) {
    try {
      // Guarded internally: a booking that paid or was confirmed between the
      // SELECT above and this write is left alone. That gap is real -- the
      // list is a plain read -- which is exactly why the guard lives in the
      // write rather than in this loop.
      const released = await releaseUnpaidBooking(booking.id, db);
      if (!released) {
        result.skipped++;
        continue;
      }
      result.released++;
      await logBookingEvent(
        booking.id,
        "system",
        "expired_unpaid",
        { held_minutes: holdMinutes, swept_at: Math.floor(now.getTime() / 1000) },
        db
      );
    } catch (err) {
      // One bad row must not strand every other held seat -- same
      // per-booking isolation as the notification cron's processBatch.
      console.error(`expiry-sweep: failed to release booking ${booking.id}`, err);
      result.failed++;
    }
  }

  return result;
}
