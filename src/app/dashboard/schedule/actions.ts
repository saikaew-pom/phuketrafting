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
  removeFutureEmptyForSlot,
} from "@/lib/queries/session-templates";
import { generateSessions } from "@/lib/session-generator";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function backTo(tourId: string, extra: Record<string, string>): string {
  return `/dashboard/schedule?${new URLSearchParams({ tourId, ...extra }).toString()}`;
}

/**
 * Add a weekly slot, then materialise it into real departures right away
 * (generateSessions is idempotent -- it only fills the gaps the new template
 * just opened). Admin-gated: the schedule is the supply side of the whole
 * booking engine, not a front-desk edit.
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
  await generateSessions();
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "added" }));
}

/**
 * Edit a slot's seats / on-off. Reconciles future EMPTY departures so the
 * change is real: a new capacity retro-applies to open departures; turning a
 * slot OFF removes its future empty departures; turning it back ON regenerates
 * them. Booked or blocked departures are never touched.
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
    await applyCapacityToFutureEmpty(tourId, tmpl!.weekday, tmpl!.start_time, capacity);
    await generateSessions(); // refill if it had been off
  } else {
    await removeFutureEmptyForSlot(tourId, tmpl!.weekday, tmpl!.start_time);
  }
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "updated" }));
}

/**
 * Delete a slot and remove its future EMPTY departures. Departures already
 * carrying bookings survive (a schedule edit can't cancel a guest -- staff
 * close those with a reason, which also refunds).
 */
export async function deleteScheduleSlot(templateId: string): Promise<void> {
  await requireAdmin();
  const tmpl = await getSessionTemplate(templateId);
  if (!tmpl) redirect("/dashboard/schedule?error=gone");
  const tourId = tmpl!.tour_id;

  await removeFutureEmptyForSlot(tourId, tmpl!.weekday, tmpl!.start_time);
  await deleteSessionTemplate(templateId);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/availability");
  redirect(backTo(tourId, { saved: "deleted" }));
}
