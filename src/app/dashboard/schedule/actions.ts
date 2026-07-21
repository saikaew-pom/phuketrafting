"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import {
  createSessionTemplate,
  updateSessionTemplateActive,
  deleteSessionTemplate,
  getSessionTemplate,
  templateSlotExists,
  applyCapacityToFutureEmpty,
  blockFutureEmptyForSlot,
  restoreFutureBlockedForSlot,
} from "@/lib/queries/session-templates";
import { generateSessions } from "@/lib/session-generator";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function backTo(tourId: string, extra: Record<string, string>): string {
  return `/dashboard/schedule?${new URLSearchParams({ tourId, ...extra }).toString()}`;
}

/**
 * Add a weekly slot, then materialise it into real departures right away:
 * reopen any this slot's own earlier deletion retired, then generateSessions
 * (idempotent -- it only fills the gaps the new template just opened).
 * Admin-gated: the schedule is the supply side of the whole booking engine, not
 * a front-desk edit.
 */
export async function addScheduleSlot(formData: FormData): Promise<void> {
  await requireAdmin();
  const tourId = String(formData.get("tourId") ?? "").trim();
  const fail = (c: string) => redirect(backTo(tourId, { error: c }));
  if (!tourId) fail("no_tour");

  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "").trim();
  const rawCap = String(formData.get("capacity") ?? "").trim();
  const capacity = Number(rawCap);

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) fail("bad_day");
  if (!TIME_RE.test(startTime)) fail("bad_time");
  if (!rawCap || !Number.isInteger(capacity) || capacity < 1) fail("bad_capacity");
  if (await templateSlotExists(tourId, weekday, startTime)) fail("duplicate");

  await createSessionTemplate(tourId, weekday, startTime, capacity);
  // Re-adding a slot that was previously DELETED must reopen the departures that
  // deletion retired. generateSessions() cannot: its ON CONFLICT(id) DO NOTHING
  // is a no-op against rows that still exist, so without this the re-added slot
  // would come back permanently unbookable. Runs before the generator so the
  // window is consistent by the time it fills the far edge.
  await restoreFutureBlockedForSlot(tourId, weekday, startTime);
  await generateSessions();
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "added" }));
}

/**
 * Edit a slot's seats / on-off. Reconciles future EMPTY departures so the
 * change is real: a new capacity retro-applies to open departures; turning a
 * slot OFF closes its future empty departures; turning it back ON reopens
 * exactly those and regenerates any the window has since outgrown. Booked
 * departures, and ones a human closed with their own reason, are never touched.
 */
export async function updateScheduleSlot(templateId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const tmpl = await getSessionTemplate(templateId);
  if (!tmpl) redirect("/dashboard/schedule?error=gone");
  const tourId = tmpl!.tour_id;

  const rawCap = String(formData.get("capacity") ?? "").trim();
  const capacity = Number(rawCap);
  const isActive = formData.get("is_active") === "on";
  if (!rawCap || !Number.isInteger(capacity) || capacity < 1) redirect(backTo(tourId, { error: "bad_capacity" }));

  await updateSessionTemplateActive(templateId, capacity, isActive);
  if (isActive) {
    // Reopen FIRST. The off-switch retires departures by blocking them, not by
    // deleting them, so both reconcilers below skip them until they are open
    // again: applyCapacityToFutureEmpty carries `is_blocked = 0` in its WHERE,
    // and generateSessions' ON CONFLICT DO NOTHING can never clear a block. Drop
    // this line and OFF-then-ON leaves every future departure closed while the
    // schedule screen reports the slot ON.
    await restoreFutureBlockedForSlot(tourId, tmpl!.weekday, tmpl!.start_time);
    // tmpl!.capacity is the value from BEFORE updateSessionTemplateActive
    // just overwrote it above -- the "previous" capacity applyCapacityTo
    // FutureEmpty needs to tell "never touched since the template" apart
    // from "staff hand-set this one departure" (see that function's own
    // comment).
    await applyCapacityToFutureEmpty(tourId, tmpl!.weekday, tmpl!.start_time, capacity, tmpl!.capacity);
    await generateSessions(); // refill if it had been off
  } else {
    await blockFutureEmptyForSlot(tourId, tmpl!.weekday, tmpl!.start_time);
  }
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "updated" }));
}

/**
 * Delete a slot and close its future EMPTY departures. Departures already
 * carrying bookings survive (a schedule edit can't cancel a guest -- staff
 * close those with a reason, which also refunds).
 *
 * The departures are closed rather than deleted (see blockFutureEmptyForSlot),
 * so re-adding this same weekday+time later reopens them via addScheduleSlot.
 */
export async function deleteScheduleSlot(templateId: string): Promise<void> {
  await requireAdmin();
  const tmpl = await getSessionTemplate(templateId);
  if (!tmpl) redirect("/dashboard/schedule?error=gone");
  const tourId = tmpl!.tour_id;

  await blockFutureEmptyForSlot(tourId, tmpl!.weekday, tmpl!.start_time);
  await deleteSessionTemplate(templateId);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "deleted" }));
}
