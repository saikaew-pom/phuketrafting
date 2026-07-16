import { sendBookingReceivedEmail } from "@/lib/brevo";
import { logBookingEvent } from "@/lib/booking";
import { getBookingDetail } from "@/lib/queries/bookings";

/**
 * Emails the guest an immediate "Booking Received" acknowledgement.
 *
 * WHY THIS EXISTS, and why it doesn't break plan §2's human-in-the-loop rule:
 * §2 says "all guest notifications are explicit staff button-clicks", and
 * that rule is about CONFIRMING a booking -- staff decide that, not software.
 * But it had been implemented as "send nothing at all", so a guest completed
 * a booking, was quoted a deposit, and received NOTHING until a human
 * happened to click Notify. Plan §4 lists "our own 'Booking Received' emails
 * via Brevo" as a requirement and it was never built.
 *
 * The distinction that makes this safe is the one §2 itself draws: this email
 * says Received, never Confirmed. It's a receipt for something the guest just
 * did, not a promise about a seat. Staff still confirm by hand, and the
 * "Notify guest" button still re-sends.
 *
 * Reads the PERSISTED booking rather than taking the caller's values: the
 * email must describe what actually landed in D1 (the price the booking
 * engine computed, the product it resolved), not what the form thought it
 * was asking for.
 *
 * NEVER THROWS. The booking exists and the seat is claimed by the time this
 * runs -- turning a mail failure into a booking failure would show the guest
 * "something went wrong", they'd book again, and take a second seat for a
 * booking that already succeeded. Same fail-open stance, and the same
 * reasoning, as lib/checkout.ts's openCheckoutForBooking.
 *
 * The outcome lands on booking_logs either way, so "I never got an email" has
 * an answer from the audit trail rather than a shrug.
 */
export async function sendBookingAck(bookingId: string, host: string | null): Promise<void> {
  try {
    const booking = await getBookingDetail(bookingId);
    if (!booking) {
      await safeLog(bookingId, "booking_ack_email", { status: "failed", error: "booking not found" });
      return;
    }

    // Phone/walk-in bookings legitimately have no email. Logged rather than
    // silently skipped, so "why did this guest get nothing?" has an answer.
    if (!booking.guest_email) {
      await safeLog(bookingId, "booking_ack_skipped", { reason: "no guest email on file" });
      return;
    }

    const manageUrl =
      booking.manage_token && host ? `https://${host}/${booking.locale}/manage/${booking.manage_token}` : null;

    const sent = await sendBookingReceivedEmail({
      guestName: booking.guest_name,
      guestEmail: booking.guest_email,
      productName: booking.product_name ?? "your trip",
      date: booking.date ?? "",
      total: booking.total,
      currency: booking.currency,
      manageUrl,
    });
    // sendBookingReceivedEmail returns false for "Brevo not configured" and
    // true for "Brevo accepted it". Recording those differently matters:
    // 'not_configured' is an ops problem, 'sent' is not.
    await safeLog(bookingId, "booking_ack_email", { status: sent ? "sent" : "not_configured" });
  } catch (err) {
    await safeLog(bookingId, "booking_ack_email", {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Even the logging can't throw: this runs after a successful booking, and a
 * D1 hiccup while writing an audit row must not propagate into the guest's
 * result.
 */
async function safeLog(bookingId: string, action: string, details: Record<string, unknown>): Promise<void> {
  try {
    await logBookingEvent(bookingId, "system", action, details);
  } catch (err) {
    console.error("booking-ack: failed to log", action, err);
  }
}
