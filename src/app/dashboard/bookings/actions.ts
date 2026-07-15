"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { logBookingEvent, createTourBooking } from "@/lib/booking";
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

const MAX_GUESTS_PER_BAND = 20; // same bound the public Zod schemas use (booking-actions.ts)

function parseGuestCount(formData: FormData, key: string): number {
  const n = Number(formData.get(key));
  if (!Number.isInteger(n) || n < 0 || n > MAX_GUESTS_PER_BAND) {
    throw new Error(`Invalid ${key}`);
  }
  return n;
}

// Same per-field bounds as booking-actions.ts's BookingSchema (guestName.max(120),
// guestPhone.max(40), hotel.max(200), addonChoice.max(60), promoCode.max(40)) --
// and the exact numbers already baked into this page's own maxLength attributes
// (new/page.tsx). The public path gets these bounds for free from Zod; this
// staff path parses raw FormData directly with no schema, so without this it had
// no server-side bound at all -- maxLength is an HTML attribute, purely advisory,
// bypassable the same way the numeric maxes above are (confirmed live: a raw POST
// with a 5,000-char hotel field was accepted with zero rejection before this).
const FIELD_MAX_LENGTHS: Record<string, number> = {
  guest_name: 120,
  guest_phone: 40,
  hotel: 200,
  addon_choice: 60,
  promo_code: 40,
};

function parseBoundedText(formData: FormData, key: string): string {
  const max = FIELD_MAX_LENGTHS[key];
  if (max === undefined) {
    // Programmer error (typo'd/unregistered key), not a user-input problem --
    // fail loud rather than silently skip the bound check for a field that
    // was meant to have one.
    throw new Error(`parseBoundedText: "${key}" has no registered max length`);
  }
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > max) {
    throw new Error(`${key.replace(/_/g, " ")} is too long (max ${max} characters).`);
  }
  return value;
}

/**
 * Staff-initiated tour booking (dashboard/bookings/new) -- the ONLY place
 * allowOverbook can ever be set to true. requireStaff() gates this the same
 * as every other action here; the public booking-actions.ts path never
 * touches this function or allowOverbook at all.
 */
export async function createStaffBooking(formData: FormData) {
  const staff = await requireStaff();

  const tourSessionId = String(formData.get("tour_session_id") ?? "").trim();
  const tourId = String(formData.get("tour_id") ?? "").trim();
  const guestName = parseBoundedText(formData, "guest_name");
  if (!tourSessionId || !tourId) {
    throw new Error("Please choose a tour and date.");
  }
  if (!guestName) {
    throw new Error("Guest name is required.");
  }

  const adults = parseGuestCount(formData, "adults");
  const children = parseGuestCount(formData, "children");
  const infants = parseGuestCount(formData, "infants");
  const allowOverbook = formData.get("allow_overbook") === "on";

  const result = await createTourBooking({
    tourSessionId,
    tourId,
    adults,
    children,
    infants,
    guestName,
    guestEmail: String(formData.get("guest_email") ?? "").trim() || null,
    guestPhone: parseBoundedText(formData, "guest_phone") || null,
    pickupZoneId: String(formData.get("pickup_zone_id") ?? "").trim() || null,
    hotel: parseBoundedText(formData, "hotel") || null,
    addonChoice: parseBoundedText(formData, "addon_choice") || null,
    promoCode: parseBoundedText(formData, "promo_code") || null,
    locale: "en",
    source: "staff",
    bookedByAgentId: null,
    consentMarketing: false,
    allowOverbook,
  });

  if (!result.success) {
    const messages: Record<string, string> = {
      not_found: "That session no longer exists -- pick another.",
      no_capacity: 'That session is full -- check "Allow overbook" to add this guest anyway.',
      blocked: "That session is blocked and can't be booked.",
      invalid_input: "Please check the tour/session and guest count and try again.",
    };
    throw new Error(messages[result.reason ?? ""] ?? "Something went wrong creating the booking.");
  }

  // createTourBooking's own internal "created" log entry always uses
  // actor="system" (shared with the public booking flow) -- source="staff"
  // in its details says a staff member did this, but not WHICH one. This
  // supplemental entry, with the real requireStaff() identity, is what
  // makes a manually-created (or overbooked) booking traceable to a person.
  await logBookingEvent(result.bookingId!, staff.email, "created_by_staff", { overbooked: allowOverbook });

  revalidatePath("/dashboard/bookings");
  // Staff land on the new booking's detail page -- same "create, then see
  // what you made" flow as every other admin create screen would use, and
  // lets them immediately send the confirmation email/WhatsApp if wanted.
  redirect(`/dashboard/bookings/${result.bookingId}`);
}
