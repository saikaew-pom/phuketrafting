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
