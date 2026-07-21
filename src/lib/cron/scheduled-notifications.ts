import {
  listPreArrivalDue,
  listThankYouDue,
  claimNotification,
  recordNotificationStatus,
  type DueBooking,
  type NotificationKind,
} from "@/lib/queries/notifications";
import { sendPreArrivalEmail, sendThankYouEmail, type BrevoConfig } from "@/lib/brevo";
import { logBookingEvent } from "@/lib/booking";

/**
 * The daily guest-notification crons (plan §2's "Pre-arrival automation"):
 * T-1 pickup confirmation and T+1 thank-you. Driven by the "0 1 * * *"
 * trigger via custom-worker.ts's scheduled() handler.
 *
 * Everything here takes `env` explicitly rather than reaching for
 * getCloudflareContext()/getDb() -- see queries/notifications.ts's module
 * comment for why those don't work outside a fetch.
 */

export interface ScheduledNotificationsResult {
  preArrival: { due: number; sent: number; failed: number; skipped: number };
  thankYou: { due: number; sent: number; failed: number; skipped: number };
}

/**
 * D1 stores dates as 'YYYY-MM-DD' text. Trips are sold and run in Thailand,
 * so "tomorrow" must mean tomorrow *in Thailand* -- a cron firing at 01:00
 * UTC is already 08:00 the same day in Bangkok (UTC+7), and computing the
 * offset off the Worker's UTC clock would mail the wrong day's guests near
 * the date boundary. ICT is UTC+7 year-round with no DST, so a fixed offset
 * is exact here, not an approximation.
 */
const THAILAND_UTC_OFFSET_HOURS = 7;

export function thailandDateOffset(now: Date, dayOffset: number): string {
  const shifted = new Date(now.getTime() + THAILAND_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return shifted.toISOString().slice(0, 10);
}

function manageUrlFor(booking: DueBooking, baseUrl: string | undefined): string | null {
  if (!baseUrl || !booking.manage_token) return null;
  return `${baseUrl.replace(/\/$/, "")}/${booking.locale}/manage/${booking.manage_token}`;
}

/**
 * Claim -> send -> record, per booking.
 *
 * The claim comes FIRST and a lost claim means "someone else has this, do
 * nothing" -- see claimNotification. A claimed booking whose send then fails
 * keeps its claim and gets status='failed' rather than being released: an
 * unsent reminder is visible in the dashboard and recoverable with the
 * existing staff "Notify guest" button, whereas releasing it risks a retried
 * cron re-sending to a real guest. At-most-once, deliberately.
 *
 * One booking's failure never aborts the batch -- a single bad row (a
 * malformed address Brevo rejects) must not stop every other guest that day
 * from being told when their van arrives. That invariant has to hold for
 * EVERY await in the loop, not just the send: each of the three D1/Brevo
 * calls below is individually guarded, because an unguarded throw on booking
 * #3 of 40 would silently cost the other 37 guests their reminder, and the
 * date has moved on by the next run so they'd never get one.
 */
async function processBatch(
  db: D1Database,
  bookings: DueBooking[],
  kind: NotificationKind,
  send: (booking: DueBooking) => Promise<boolean>
): Promise<{ due: number; sent: number; failed: number; skipped: number }> {
  const tally = { due: bookings.length, sent: 0, failed: 0, skipped: 0 };

  for (const booking of bookings) {
    let claimed: boolean;
    try {
      claimed = await claimNotification(db, booking.id, kind);
    } catch (err) {
      // Claim state is now unknown, so the only safe move is not to send:
      // a claim that actually landed would make a send here a potential
      // double-send on the next invocation. Skipping loses at most this
      // booking's reminder, and the row is visibly unsent either way.
      console.error(`${kind} claim failed for booking ${booking.id}`, err);
      tally.failed++;
      continue;
    }
    if (!claimed) {
      tally.skipped++;
      continue;
    }

    let status: "sent" | "failed" | "not_configured";
    let sendError: string | null = null;
    try {
      const sent = await send(booking);
      status = sent ? "sent" : "not_configured";
      if (sent) {
        tally.sent++;
      } else {
        // Brevo isn't configured at all -- not this booking's fault, and not
        // a failure worth alarming on, but it must not read as 'sent'.
        tally.skipped++;
      }
    } catch (err) {
      console.error(`${kind} send failed for booking ${booking.id}`, err);
      status = "failed";
      sendError = err instanceof Error ? err.message : String(err);
      tally.failed++;
    }

    // recordNotificationStatus below writes pre_arrival_status/thank_you_status,
    // but nothing reads those columns -- no dashboard screen, no filter, no
    // count (confirmed by grep: the Booking/BookingDetail interfaces in
    // queries/bookings.ts don't even carry them). A bounced pre-arrival email
    // was therefore invisible: the guest gets no pickup time, staff get no
    // signal, and this booking is never re-selected (claimNotification is
    // at-most-once by design). Logging the failure onto the booking's own
    // Activity tab -- the one place staff already look, and the exact pattern
    // booking-ack.ts's safeLog already uses for the same class of failure --
    // is the minimum change that makes a bounced reminder visible without a
    // new column, screen, or read path.
    if (status === "failed") {
      try {
        await logBookingEvent(booking.id, "system", `${kind}_email_failed`, { error: sendError }, db);
      } catch (logErr) {
        console.error(`${kind} failure-log itself failed for booking ${booking.id}`, logErr);
      }
    }

    // Deliberately outside the try above. Recording the outcome is
    // bookkeeping ABOUT the send, not part of it: when this was inside the
    // try, a D1 blip while writing status='sent' threw into the catch and
    // rewrote the row as 'failed' -- for a mail Brevo had already accepted
    // and delivered. Staff would then "retry" a send the guest already got.
    // A wrong status is recoverable; a double-send to a real guest is not.
    try {
      await recordNotificationStatus(db, booking.id, kind, status);
    } catch (err) {
      console.error(`${kind} status record failed for booking ${booking.id} (status=${status})`, err);
    }
  }

  return tally;
}

export async function runScheduledNotifications(
  env: CloudflareEnv,
  now: Date = new Date()
): Promise<ScheduledNotificationsResult> {
  const db = env.DB;
  const brevo: BrevoConfig = env;
  // Same reasoning as the staff notify button's manageUrl: lib/site.ts's
  // SITE_URL is the eventual custom domain, not yet pointed at this Worker
  // (DNS cutover is Phase 9). A cron has no request to read a Host header
  // from, so the live origin has to come from config. If it's unset the mail
  // still goes out, just without the manage link -- a missing link is a much
  // smaller harm than a link to a domain that doesn't resolve yet.
  const baseUrl = env.PUBLIC_BASE_URL;

  const tomorrow = thailandDateOffset(now, 1);
  const yesterday = thailandDateOffset(now, -1);

  const [preArrivalDue, thankYouDue] = await Promise.all([
    listPreArrivalDue(db, tomorrow),
    listThankYouDue(db, yesterday),
  ]);

  const preArrival = await processBatch(db, preArrivalDue, "pre_arrival", (b) =>
    sendPreArrivalEmail(
      {
        guestName: b.guest_name,
        guestEmail: b.guest_email,
        productName: b.product_name ?? "your booking",
        date: b.date ?? tomorrow,
        startTime: b.start_time,
        pickupZoneName: b.pickup_zone_name,
        pickupEarliestTime: b.pickup_earliest_time,
        hotel: b.hotel,
        manageUrl: manageUrlFor(b, baseUrl),
      },
      brevo
    )
  );

  const thankYou = await processBatch(db, thankYouDue, "thank_you", (b) =>
    sendThankYouEmail(
      {
        guestName: b.guest_name,
        guestEmail: b.guest_email,
        productName: b.product_name ?? "your trip",
        date: b.date ?? yesterday,
        startTime: b.start_time,
        pickupZoneName: b.pickup_zone_name,
        pickupEarliestTime: b.pickup_earliest_time,
        hotel: b.hotel,
        manageUrl: manageUrlFor(b, baseUrl),
      },
      brevo
    )
  );

  return { preArrival, thankYou };
}
