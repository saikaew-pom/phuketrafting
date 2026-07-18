"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireStaff, requireAdmin } from "@/lib/access";
import { getDb } from "@/lib/db";
import { generateSessions } from "@/lib/session-generator";
import { logBookingEvent } from "@/lib/booking";
import { listActiveBookingsForSession, cancelBookingReleasingSeat, recordEmailNotification } from "@/lib/queries/bookings";
import { createRefund } from "@/lib/payments";
import { sendBookingStatusEmail } from "@/lib/brevo";
import { bulkCloseRange, bulkReopenRange, bulkSetCapacityRange, undoBulkClose } from "@/lib/queries/availability-audit";

/**
 * Staff control over individual departures (plan §3: "Availability: session
 * calendar (add/block departures, adjust capacity), blocked-dates with
 * reason"). The templates say what normally runs; these actions handle the
 * exceptions -- a flooded river, a private charter, an extra raft.
 */

/**
 * Block or unblock one departure. Blocking is how a departure is cancelled:
 * the row (and its bookings, and its audit trail) stays, listAvailableTourSessions
 * stops offering it, and createTourBooking's guard refuses it outright --
 * deleting the row would orphan any booking already on it.
 */
export async function setSessionBlocked(sessionId: string, blocked: boolean, formData: FormData): Promise<void> {
  await requireStaff();

  const reason = String(formData.get("block_reason") ?? "").trim();
  if (blocked && !reason) {
    throw new Error("Give a reason for blocking -- it's what staff see later when asking why this date is closed.");
  }

  const result = await getDb()
    .prepare("UPDATE tour_sessions SET is_blocked = ?1, block_reason = ?2, updated_at = unixepoch() WHERE id = ?3")
    .bind(blocked ? 1 : 0, blocked ? reason : null, sessionId)
    .run();
  if (result.meta.changes === 0) throw new Error("That departure no longer exists.");

  revalidatePath("/dashboard/availability");
}

/**
 * Adjust one departure's capacity.
 *
 * Refuses to leave the departure oversold. The atomic claim in scheduling.ts
 * guards new bookings against capacity, but nothing stops this form from
 * cutting capacity out from under seats that are already sold -- which
 * wouldn't cancel anyone, it would just make the session permanently,
 * silently oversold. Rejecting is right: staff who genuinely need fewer seats
 * must move or cancel the guests first, which is a decision, not arithmetic.
 *
 * The invariant is the SAME one every other capacity check in the codebase
 * uses -- `booked_count <= capacity - allotment_hold`, not `booked_count <=
 * capacity`. Comparing against bare capacity let a session with an
 * allotment_hold (seats reserved for GetYourGuide) be cut to exactly
 * booked_count and still "pass", landing in precisely the oversold state this
 * guard exists to prevent: listAvailableTourSessions then hides the departure,
 * and -- worse -- claimTourSessionCapacity's release path (delta < 0) is
 * guarded by the same expression, so guests on it could no longer even be
 * cancelled off it.
 *
 * Guarded UPDATE rather than SELECT-then-UPDATE, the same pattern and the same
 * reasoning as claimTourSessionCapacity: D1 has no BEGIN/COMMIT, so a separate
 * check-then-write races a concurrent booking claiming a seat in the gap, and
 * the write would happily commit a capacity that was valid when it was read
 * and oversold by the time it landed. Folding the check into the write closes
 * that gap; the read below is diagnostic only (for the error message), never
 * used to decide anything.
 */
export async function setSessionCapacity(sessionId: string, formData: FormData): Promise<void> {
  await requireStaff();

  const raw = String(formData.get("capacity") ?? "").trim();
  if (!raw) throw new Error("Capacity is required.");
  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error("Capacity must be a whole number.");

  const result = await getDb()
    .prepare(
      `UPDATE tour_sessions
          SET capacity = ?1, updated_at = unixepoch()
        WHERE id = ?2
          AND ?1 - allotment_hold >= booked_count`
    )
    .bind(capacity, sessionId)
    .run();
  if (result.meta.changes > 0) {
    revalidatePath("/dashboard/availability");
    return;
  }

  // Zero rows changed -- work out *why* for a better message.
  const session = await getDb()
    .prepare("SELECT booked_count, allotment_hold FROM tour_sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ booked_count: number; allotment_hold: number }>();
  if (!session) throw new Error("That departure no longer exists.");
  const floor = session.booked_count + session.allotment_hold;
  throw new Error(
    `${session.booked_count} guest${session.booked_count === 1 ? " is" : "s are"} already booked on this departure` +
      (session.allotment_hold > 0 ? ` and ${session.allotment_hold} seat(s) are held for agents` : "") +
      ` -- capacity can't go below ${floor}. Move or cancel them first.`
  );
}

/**
 * Consequence-aware close of a departure that has bookings on it.
 *
 * `mode`:
 *  - "quiet"  -> just block the departure (no email, no refund). The guests
 *               stay booked; staff will handle them. Same effect as
 *               setSessionBlocked, kept here so the confirmation flow has one
 *               entry point.
 *  - "refund" -> block, THEN cancel every active booking on it (releasing its
 *               seat), refund the deposit of the paid ones via Stripe, and
 *               email each guest that their trip is cancelled.
 *
 * Admin-gated, not staff: this moves real money. Ordering is deliberate --
 * block FIRST (a guarded UPDATE) so no new booking can land mid-batch, then
 * process the existing guests. Each guest is handled in its own try/catch and
 * every outcome is logged: one failed refund or email must not abort the rest,
 * and the seat-release + cancellation (the D1 truth) has already committed
 * atomically via cancelBookingReleasingSeat before the external calls run, so
 * a Stripe/Brevo outage degrades to "cancelled, refund/email pending" (staff
 * retry from the booking), never to a half-cancelled session. Never throws for
 * a per-guest failure; redirects back with a summary the page shows as a banner.
 */
export async function closeSession(sessionId: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const reason = String(formData.get("block_reason") ?? "").trim();
  if (!reason) throw new Error("Give a reason for closing this departure.");
  const mode = formData.get("mode") === "refund" ? "refund" : "quiet";

  const db = getDb();
  // Block first. Guarded UPDATE, same as setSessionBlocked -- a departure that
  // vanished shouldn't silently no-op into a refund run.
  const blockResult = await db
    .prepare("UPDATE tour_sessions SET is_blocked = 1, block_reason = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(reason, sessionId)
    .run();
  if (blockResult.meta.changes === 0) throw new Error("That departure no longer exists.");

  let cancelled = 0;
  let refunded = 0;
  let failed = 0;

  if (mode === "refund") {
    const bookings = await listActiveBookingsForSession(sessionId);
    const { env } = getCloudflareContext();
    const host = (await headers()).get("host");

    for (const b of bookings) {
      try {
        // Atomic: releases the seat AND flips status to cancelled. If this
        // returns false the booking was already cancelled/absent -- skip.
        const cancelledOk = await cancelBookingReleasingSeat(b.id);
        if (!cancelledOk) continue;
        cancelled++;
        await logBookingEvent(b.id, admin.email, "cancelled_by_closure", { reason, session_id: sessionId });

        // Refund only what was actually captured. A deposit-mode booking that
        // paid shows payment_status "paid" with a Stripe session; anything
        // awaiting_payment/pay-on-day has nothing to refund.
        if (b.payment_status === "paid" && b.stripe_checkout_session_id) {
          try {
            const refund = await createRefund(
              { sessionId: b.stripe_checkout_session_id, amountBaht: null, reason, actorEmail: admin.email },
              env
            );
            refunded++;
            await logBookingEvent(b.id, admin.email, "refund_issued", {
              reason,
              refund_id: refund.id,
              amount_satang: refund.amountSatang,
              status: refund.status,
            });
          } catch (refundErr) {
            failed++;
            console.error(`closeSession: refund failed for ${b.id}`, refundErr);
            await logBookingEvent(b.id, admin.email, "refund_failed", {
              reason,
              error: refundErr instanceof Error ? refundErr.message : String(refundErr),
            }).catch(() => {});
          }
        }

        // Cancellation email -- best effort, never blocks the cancellation, but
        // its OUTCOME is recorded (last_email_status + an activity-log event),
        // same as changeBookingStatus's sendStatusChangeNotifications. Without
        // this a guest could be cancelled+refunded and silently NOT emailed
        // (Brevo unconfigured returns false, not a throw) with no trace of why.
        if (b.guest_email) {
          const manageUrl = b.manage_token && host ? `https://${host}/${b.locale}/manage/${b.manage_token}` : null;
          try {
            const sent = await sendBookingStatusEmail(
              {
                guestName: b.guest_name,
                guestEmail: b.guest_email,
                productName: b.product_name,
                date: b.date,
                total: b.total,
                currency: b.currency,
                manageUrl,
              },
              "cancelled"
            );
            await recordEmailNotification(b.id, sent ? "sent" : "not_configured");
            await logBookingEvent(b.id, admin.email, "cancellation_email", { result: sent ? "sent" : "not_configured" });
          } catch (mailErr) {
            console.error(`closeSession: cancellation email failed for ${b.id}`, mailErr);
            await recordEmailNotification(b.id, "failed").catch(() => {});
            await logBookingEvent(b.id, admin.email, "cancellation_email", {
              result: "failed",
              error: mailErr instanceof Error ? mailErr.message : String(mailErr),
            }).catch(() => {});
          }
        } else {
          await logBookingEvent(b.id, admin.email, "cancellation_email", { result: "skipped", reason: "no guest email on file" }).catch(() => {});
        }
      } catch (err) {
        failed++;
        console.error(`closeSession: processing failed for ${b.id}`, err);
      }
    }
  }

  revalidatePath("/dashboard/availability");
  revalidatePath("/dashboard/bookings");
  // Back to the same day view (drop ?close) with a one-line summary banner.
  // tourId/month/day ride along as hidden fields so we return to context.
  const q = new URLSearchParams({ closed: mode, cancelled: String(cancelled), refunded: String(refunded), failed: String(failed) });
  for (const k of ["tourId", "month", "day"] as const) {
    const v = String(formData.get(k) ?? "").trim();
    if (v) q.set(k, v);
  }
  redirect(`/dashboard/availability?${q.toString()}`);
}

// ---- Bulk range actions (stage C) ----

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a bulk range from the form; throws a friendly message on a bad one. */
function parseRange(formData: FormData): { tourId: string; month: string; from: string; to: string } {
  const tourId = String(formData.get("tourId") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  if (!tourId) throw new Error("Pick a tour first.");
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new Error("Enter valid from/to dates.");
  if (from > to) throw new Error("The 'from' date must be on or before the 'to' date.");
  // A year is well beyond the 120-day generation window; anything larger is a
  // typo, not an intent, and shouldn't scan the whole table.
  const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (spanDays > 366) throw new Error("That range is too wide -- pick a year or less.");
  return { tourId, month, from, to };
}

function backToMonth(tourId: string, month: string, extra: Record<string, string>): string {
  return `/dashboard/availability?${new URLSearchParams({ tourId, month, ...extra }).toString()}`;
}

/** Close every open departure in a date range (quiet block -- no refunds). */
export async function bulkClose(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const { tourId, month, from, to } = parseRange(formData);
  const reason = String(formData.get("block_reason") ?? "").trim();
  if (!reason) throw new Error("Give a reason for closing these dates.");
  const n = await bulkCloseRange(tourId, from, to, reason, staff.email);
  revalidatePath("/dashboard/availability");
  redirect(backToMonth(tourId, month, { bulk: "close", n: String(n) }));
}

/** Reopen every closed departure in a date range. */
export async function bulkReopen(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const { tourId, month, from, to } = parseRange(formData);
  const n = await bulkReopenRange(tourId, from, to, staff.email);
  revalidatePath("/dashboard/availability");
  redirect(backToMonth(tourId, month, { bulk: "reopen", n: String(n) }));
}

/** Set capacity for every priceable departure in a date range (skips oversold ones). */
export async function bulkSetCapacity(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const { tourId, month, from, to } = parseRange(formData);
  const raw = String(formData.get("capacity") ?? "").trim();
  if (!raw) throw new Error("Capacity is required.");
  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error("Capacity must be a whole number.");
  const { changed, total } = await bulkSetCapacityRange(tourId, from, to, capacity, staff.email);
  revalidatePath("/dashboard/availability");
  redirect(backToMonth(tourId, month, { bulk: "capacity", n: String(changed), skipped: String(total - changed) }));
}

/** Undo a bulk_close (reopen exactly the departures it blocked). */
export async function undoAvailabilityAction(auditId: string, formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const tourId = String(formData.get("tourId") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const n = await undoBulkClose(auditId, staff.email);
  revalidatePath("/dashboard/availability");
  redirect(backToMonth(tourId, month, { bulk: "undo", n: String(n) }));
}

/**
 * Fills the rolling window on demand.
 *
 * The daily cron does this automatically, but that leaves two real gaps this
 * button closes: a brand-new environment has no departures until 08:00
 * Bangkok tomorrow, and a staff member who just changed the schedule wants to
 * see it take effect now rather than trust that it will. Idempotent, so
 * pressing it repeatedly is harmless.
 */
export async function generateNow(): Promise<void> {
  await requireStaff();
  await generateSessions();
  revalidatePath("/dashboard/availability");
}
