import { getDb } from "@/lib/db";
import { bangkokTodayISO } from "@/lib/format";

/**
 * The weekly schedule (session_templates) -- the durable statement of "we run
 * 09:00 every day", which lib/session-generator.ts materializes into bookable
 * tour_sessions over a rolling window. Until now it was dev-only; this is the
 * staff-editable layer (Availability redesign stage D).
 *
 * The generator is idempotent and only FILLS GAPS (ON CONFLICT DO NOTHING), so
 * a template edit has no effect on its own -- these helpers do the
 * reconciliation the generator can't: retro-applying a capacity change to
 * future EMPTY departures, and removing future EMPTY departures for a slot that
 * was turned off or deleted. "Empty" = booked_count 0 AND not blocked: a
 * departure with a booking is a commitment, and a blocked one is a staff
 * decision -- neither is ever touched by a schedule edit (they age out of the
 * window naturally).
 */

export interface SessionTemplate {
  id: string;
  tour_id: string;
  weekday: number; // 0=Sun .. 6=Sat
  start_time: string; // 'HH:MM'
  capacity: number;
  is_active: number;
}

/**
 * The block_reason stamped on departures retired because their weekly slot was
 * switched off or deleted -- and the exact string restoreFutureBlockedForSlot
 * matches to undo that.
 *
 * A shared constant rather than two literals because the block/restore pair only
 * works if they agree character-for-character: drift would silently strand every
 * retired departure as unreopenable, which is the same class of silent failure
 * this whole mechanism exists to avoid. It is also staff-visible text -- the
 * availability calendar renders block_reason -- so it reads as a sentence.
 */
export const SLOT_RETIRED_BLOCK_REASON = "Slot removed from schedule";

export async function listSessionTemplates(tourId: string): Promise<SessionTemplate[]> {
  const { results } = await getDb()
    .prepare(
      "SELECT id, tour_id, weekday, start_time, capacity, is_active FROM session_templates WHERE tour_id = ?1 ORDER BY weekday, start_time"
    )
    .bind(tourId)
    .all<SessionTemplate>();
  return results;
}

export async function createSessionTemplate(
  tourId: string,
  weekday: number,
  startTime: string,
  capacity: number
): Promise<void> {
  await getDb()
    .prepare(
      "INSERT INTO session_templates (id, tour_id, weekday, start_time, capacity) VALUES (?1, ?2, ?3, ?4, ?5)"
    )
    .bind(`tmpl-${crypto.randomUUID().slice(0, 12)}`, tourId, weekday, startTime, capacity)
    .run();
}

/** True if the tour already runs this weekday+time (templates shouldn't duplicate a slot). */
export async function templateSlotExists(tourId: string, weekday: number, startTime: string): Promise<boolean> {
  const row = await getDb()
    .prepare("SELECT id FROM session_templates WHERE tour_id = ?1 AND weekday = ?2 AND start_time = ?3")
    .bind(tourId, weekday, startTime)
    .first<{ id: string }>();
  return row != null;
}

/**
 * Retro-apply a template's capacity to its FUTURE EMPTY departures, so editing
 * "24 -> 30 seats" actually changes the open departures, not just ones
 * generated from now on. booked_count = 0 keeps this safe (can't oversell),
 * is_blocked = 0 leaves closed dates alone, and allotment_hold = 0 leaves an
 * OTA-reserved departure to the (parked) OTA sync -- a schedule edit must never
 * cut capacity below seats already promised to an agent.
 */
export async function applyCapacityToFutureEmpty(
  tourId: string,
  weekday: number,
  startTime: string,
  capacity: number
): Promise<number> {
  const today = bangkokTodayISO();
  const res = await getDb()
    .prepare(
      `UPDATE tour_sessions SET capacity = ?1, updated_at = unixepoch()
        WHERE tour_id = ?2 AND start_time = ?3 AND date >= ?4
          AND CAST(strftime('%w', date) AS INTEGER) = ?5
          AND booked_count = 0 AND is_blocked = 0 AND allotment_hold = 0`
    )
    .bind(capacity, tourId, startTime, today, weekday)
    .run();
  return res.meta.changes ?? 0;
}

/**
 * Retire future EMPTY departures for a slot that was turned off or deleted, so
 * the schedule change takes effect. A departure with bookings or a manual block
 * survives (it isn't the generator's to remove).
 *
 * BLOCKS rather than DELETEs, despite "empty" in the predicate. `booked_count =
 * 0` does NOT mean "no row references this session":
 *
 *   - bookings.tour_session_id (0005) has no ON DELETE clause, and a CANCELLED
 *     booking keeps its tour_session_id forever -- nothing ever nulls it -- while
 *     booked_count has already returned to 0.
 *   - chat_booking_drafts.tour_session_id (0014) is NOT NULL and drafts are only
 *     ever marked consumed_at, never deleted.
 *
 * So a DELETE here raised FOREIGN KEY constraint failed (reproduced against a
 * copy of the real local D1: one cancelled booking, or one consumed chat draft,
 * turned a clean 17-row delete into 0 rows and a throw). Because D1 has no
 * cross-call transaction, the caller's preceding updateSessionTemplateActive
 * had already committed -- so the schedule screen showed the slot OFF while all
 * ~17 future departures stayed is_blocked = 0 and kept being returned by
 * listAvailableTourSessions. Guests went on booking a departure the operator had
 * decided not to run, staff had no signal, and every retry failed identically.
 *
 * Blocking is also what the rest of the app already argues for -- see
 * availability/actions.ts: "deleting the row would orphan any booking already on
 * it". The generator cannot resurrect these: the template is inactive, and its
 * ON CONFLICT DO NOTHING can never unblock an existing row.
 *
 * Named "block", not "remove": the old name is exactly the assumption that broke
 * the re-enable path (whoever wrote it believed the rows were gone, so turning a
 * slot back on only had to regenerate). restoreFutureBlockedForSlot below is its
 * inverse and every caller that re-enables a slot must pair the two.
 */
export async function blockFutureEmptyForSlot(tourId: string, weekday: number, startTime: string): Promise<number> {
  const today = bangkokTodayISO();
  const res = await getDb()
    .prepare(
      `UPDATE tour_sessions
          SET is_blocked = 1, block_reason = ?5, updated_at = unixepoch()
        WHERE tour_id = ?1 AND start_time = ?2 AND date >= ?3
          AND CAST(strftime('%w', date) AS INTEGER) = ?4
          AND booked_count = 0 AND is_blocked = 0 AND allotment_hold = 0`
    )
    .bind(tourId, startTime, today, weekday, SLOT_RETIRED_BLOCK_REASON)
    .run();
  return res.meta.changes ?? 0;
}

/**
 * Inverse of blockFutureEmptyForSlot: reopens the future departures THIS module
 * retired, for a slot that is being turned back on (or re-added).
 *
 * Required because blocking replaced deleting. Under the old DELETE, re-enabling
 * a slot was self-healing -- the rows were gone, so generateSessions() simply
 * recreated them open. Blocked rows survive, and neither reconciler can clear
 * them: applyCapacityToFutureEmpty carries `is_blocked = 0` in its WHERE, and the
 * generator's ON CONFLICT(id) DO NOTHING cannot touch a row that already exists.
 * Verified: OFF then ON left all future departures is_blocked = 1 and
 * listAvailableTourSessions returning zero, with the schedule screen showing the
 * slot ON -- a silent supply outage.
 *
 * Matched on SLOT_RETIRED_BLOCK_REASON, not merely `is_blocked = 1`. That is the
 * load-bearing part: a departure closed by a human (availability/actions.ts
 * writes a staff-supplied reason) is a decision this must never overturn, so the
 * sentinel is the only thing that distinguishes "we retired this because the
 * slot was off" from "someone closed this date on purpose".
 */
export async function restoreFutureBlockedForSlot(
  tourId: string,
  weekday: number,
  startTime: string
): Promise<number> {
  const today = bangkokTodayISO();
  const res = await getDb()
    .prepare(
      `UPDATE tour_sessions
          SET is_blocked = 0, block_reason = NULL, updated_at = unixepoch()
        WHERE tour_id = ?1 AND start_time = ?2 AND date >= ?3
          AND CAST(strftime('%w', date) AS INTEGER) = ?4
          AND is_blocked = 1 AND block_reason = ?5`
    )
    .bind(tourId, startTime, today, weekday, SLOT_RETIRED_BLOCK_REASON)
    .run();
  return res.meta.changes ?? 0;
}

export async function updateSessionTemplateActive(id: string, capacity: number, isActive: boolean): Promise<void> {
  await getDb()
    .prepare("UPDATE session_templates SET capacity = ?1, is_active = ?2 WHERE id = ?3")
    .bind(capacity, isActive ? 1 : 0, id)
    .run();
}

export async function getSessionTemplate(id: string): Promise<SessionTemplate | null> {
  return getDb()
    .prepare("SELECT id, tour_id, weekday, start_time, capacity, is_active FROM session_templates WHERE id = ?1")
    .bind(id)
    .first<SessionTemplate>();
}

export async function deleteSessionTemplate(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM session_templates WHERE id = ?1").bind(id).run();
}
