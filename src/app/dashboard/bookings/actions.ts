"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { updateBookingStatus, updateCheckedIn, updateBookingNotes, type BookingStatus } from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";

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
