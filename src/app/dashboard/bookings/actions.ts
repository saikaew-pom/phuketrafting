"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import {
  updateBookingStatus,
  updateCheckedIn,
  updateBookingNotes,
  getBookingDetail,
  recordEmailNotification,
  recordWhatsAppNotification,
  type BookingStatus,
} from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";
import { sendBookingReceivedEmail } from "@/lib/brevo";

const VALID_STATUSES: readonly BookingStatus[] = ["pending", "confirmed", "completed", "cancelled", "no_show"];

export async function changeBookingStatus(bookingId: string, formData: FormData) {
  // Server Actions are reachable via direct POST regardless of whether the
  // dashboard layout ever rendered for this caller -- see requireStaff()'s
  // doc comment in src/lib/access.ts. Same pattern as tours/actions.ts.
  const staff = await requireStaff();

  const status = String(formData.get("status") ?? "");
  if (!VALID_STATUSES.includes(status as BookingStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  // Reject a nonexistent bookingId here, with a clear message, instead of
  // letting a silent 0-row UPDATE fall through to logBookingEvent below and
  // crash on booking_logs' FK constraint (confirmed live: that produced an
  // opaque "FOREIGN KEY constraint failed" 500 with no indication of the
  // real cause).
  const updated = await updateBookingStatus(bookingId, status as BookingStatus);
  if (!updated) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  await logBookingEvent(bookingId, staff.email, "status_changed", { status });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
}

export async function toggleCheckedIn(bookingId: string, formData: FormData) {
  const staff = await requireStaff();

  const checkedIn = formData.get("checked_in") === "on";
  const updated = await updateCheckedIn(bookingId, checkedIn);
  if (!updated) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  await logBookingEvent(bookingId, staff.email, checkedIn ? "checked_in" : "checked_in_undone", {});

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard/bookings");
}

export async function saveBookingNotes(bookingId: string, formData: FormData) {
  const staff = await requireStaff();

  const notes = String(formData.get("notes") ?? "").trim();
  const updated = await updateBookingNotes(bookingId, notes);
  if (!updated) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  await logBookingEvent(bookingId, staff.email, "notes_updated", { notes });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

// _formData is unused (this form has no fields, just a submit button) but
// must stay in the signature -- Next always passes the submitted FormData
// as the bound action's last argument, whether or not the form has fields.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function notifyGuestEmail(bookingId: string, _formData: FormData) {
  const staff = await requireStaff();

  const booking = await getBookingDetail(bookingId);
  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  if (!booking.guest_email) {
    // No email on file -- nothing to send. Logged (not silently skipped) so
    // staff clicking "Notify guest" on a phone-only booking see WHY nothing
    // happened, instead of wondering if the click did anything at all.
    await logBookingEvent(bookingId, staff.email, "notify_email_skipped", { reason: "no guest email on file" });
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return;
  }

  // A Brevo outage or misconfiguration here is a real, staff-visible,
  // recoverable situation (unlike sendEnquiryNotification's fire-and-forget
  // background use) -- catch it so it records last_email_status='failed'
  // and shows up in the activity log, rather than crashing this action into
  // the same unhandled-500 gap flagged for the rest of /dashboard.
  let status: "sent" | "failed" | "not_configured";
  try {
    const sent = await sendBookingReceivedEmail({
      guestName: booking.guest_name,
      guestEmail: booking.guest_email,
      productName: booking.product_name ?? "your booking",
      date: booking.date ?? "",
      total: booking.total,
      currency: booking.currency,
    });
    // sendBookingReceivedEmail returns false (does not throw) when Brevo
    // isn't configured -- confirmed live that without this check, a
    // misconfigured Brevo recorded last_email_status='sent' for an email
    // that was never actually sent, since a no-op and a genuine send both
    // resolve without throwing. Must be distinguished, not treated as success.
    status = sent ? "sent" : "not_configured";
  } catch (err) {
    console.error(`notifyGuestEmail: send failed for booking ${bookingId}`, err);
    status = "failed";
  }

  // Same existence-check-before-log pattern as every other update* call site
  // in this file (see bookings.ts's doc comment on updateBookingStatus) --
  // booking existed moments ago via getBookingDetail above, but that read
  // and this write aren't atomic, so don't assume the write still matched a
  // row; check it explicitly rather than letting a silent 0-row UPDATE fall
  // through into logBookingEvent's FK-constrained INSERT.
  const recorded = await recordEmailNotification(bookingId, status);
  if (!recorded) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  await logBookingEvent(bookingId, staff.email, "notify_email", { status });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see notifyGuestEmail's identical comment above.
export async function markWhatsAppSent(bookingId: string, _formData: FormData) {
  const staff = await requireStaff();

  const updated = await recordWhatsAppNotification(bookingId);
  if (!updated) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  await logBookingEvent(bookingId, staff.email, "notify_whatsapp_manual", {});

  revalidatePath(`/dashboard/bookings/${bookingId}`);
}
