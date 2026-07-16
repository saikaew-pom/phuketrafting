"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";
import { generateSessions } from "@/lib/session-generator";

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
 * Refuses to go below what's already booked. The atomic claim in
 * scheduling.ts guards new bookings against capacity, but nothing stops this
 * form from setting capacity BELOW booked_count -- which wouldn't cancel
 * anyone, it would just make the session permanently, silently oversold, and
 * every later capacity check would read as full. Rejecting is right: staff
 * who genuinely need fewer seats must move or cancel the guests first, which
 * is a decision, not arithmetic.
 */
export async function setSessionCapacity(sessionId: string, formData: FormData): Promise<void> {
  await requireStaff();

  const raw = String(formData.get("capacity") ?? "").trim();
  if (!raw) throw new Error("Capacity is required.");
  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error("Capacity must be a whole number.");

  const session = await getDb()
    .prepare("SELECT booked_count FROM tour_sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ booked_count: number }>();
  if (!session) throw new Error("That departure no longer exists.");
  if (capacity < session.booked_count) {
    throw new Error(
      `${session.booked_count} guest${session.booked_count === 1 ? " is" : "s are"} already booked on this departure -- capacity can't go below that. Move or cancel them first.`
    );
  }

  await getDb()
    .prepare("UPDATE tour_sessions SET capacity = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(capacity, sessionId)
    .run();

  revalidatePath("/dashboard/availability");
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
