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
 * Remove future EMPTY departures for a slot that was turned off or deleted, so
 * the schedule change takes effect. A departure with bookings or a manual block
 * survives (it isn't the generator's to remove).
 */
export async function removeFutureEmptyForSlot(tourId: string, weekday: number, startTime: string): Promise<number> {
  const today = bangkokTodayISO();
  const res = await getDb()
    .prepare(
      `DELETE FROM tour_sessions
        WHERE tour_id = ?1 AND start_time = ?2 AND date >= ?3
          AND CAST(strftime('%w', date) AS INTEGER) = ?4
          AND booked_count = 0 AND is_blocked = 0 AND allotment_hold = 0`
    )
    .bind(tourId, startTime, today, weekday)
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
