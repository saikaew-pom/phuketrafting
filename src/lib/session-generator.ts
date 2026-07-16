import { getDb } from "@/lib/db";

/**
 * Materializes `session_templates` (the recurring weekly schedule) into real
 * `tour_sessions` rows (the bookable departures) over a rolling window.
 *
 * This is the supply side of the booking engine, and until now it did not
 * exist: `session_templates` was created in migration 0002 and referenced
 * exactly once in the whole repo -- its own CREATE TABLE. Nothing generated
 * departures, so a fresh database had zero `tour_sessions` and the public
 * widget truthfully reported "No open dates in the next 90 days". lib/
 * scheduling.ts is a proven, concurrency-safe capacity layer that was sitting
 * on a table with no supply.
 *
 * Why a generator and a cron rather than a one-off seed of ~90 days of rows:
 * a seed silently expires. Ninety days later the widget goes empty again and
 * it looks like a fresh bug rather than a calendar that simply ran out. The
 * template is the durable statement of intent ("we run 09:00 every day");
 * sessions are a materialized cache of it that must keep rolling forward.
 */

/** How far ahead departures exist. Matches the public widget's own 90-day search window. */
export const GENERATE_WINDOW_DAYS = 120;

export interface GenerateResult {
  created: number;
  skipped: number;
  windowEnd: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Thailand is UTC+7 year-round (no DST), and "today" for a Thai tour operator
 * is the Bangkok day -- the same fixed-offset reasoning the notification cron
 * and chat grounding use. A cron firing at 01:00 UTC is 08:00 in Phang Nga;
 * without the offset it would generate against yesterday's date for the first
 * seven hours of every Thai day.
 */
function bangkokToday(now: Date): Date {
  return new Date(new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) + "T00:00:00Z");
}

interface TemplateRow {
  id: string;
  tour_id: string | null;
  weekday: number;
  start_time: string;
  capacity: number;
}

/**
 * Generates missing departures for the window [today, today + windowDays].
 *
 * IDEMPOTENT, and that is the whole design: it is safe to run every day,
 * twice, or by hand. A session's id is derived deterministically from
 * (tour, date, time), so re-running cannot duplicate a departure, and the
 * INSERT is guarded by ON CONFLICT DO NOTHING so it can never overwrite a
 * session that already carries bookings, a capacity override, or a block.
 * Staff edits always win over the template -- the generator only ever fills
 * gaps at the far edge of the window.
 *
 * `dbOverride` for the cron: getDb() needs a request context and scheduled()
 * has none -- same pattern as the expiry sweeper and notification cron.
 */
export async function generateSessions(
  dbOverride?: D1Database,
  now: Date = new Date(),
  windowDays: number = GENERATE_WINDOW_DAYS
): Promise<GenerateResult> {
  const db = dbOverride ?? getDb();

  const { results: templates } = await db
    .prepare(
      `SELECT t.id, t.tour_id, t.weekday, t.start_time, t.capacity
         FROM session_templates t
         JOIN tours ON tours.id = t.tour_id
        WHERE t.is_active = 1 AND tours.is_active = 1`
    )
    .all<TemplateRow>();

  // A template with tour_id NULL means "shared river session across tours"
  // per the schema comment. Nothing consumes that shape yet (tour_sessions
  // requires a tour_id to be bookable), so the JOIN above excludes them
  // rather than silently generating unbookable departures.
  if (templates.length === 0) {
    return { created: 0, skipped: 0, windowEnd: isoDate(bangkokToday(now)) };
  }

  const start = bangkokToday(now);
  const statements: D1PreparedStatement[] = [];
  let candidates = 0;

  for (let offset = 0; offset <= windowDays; offset++) {
    const day = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const date = isoDate(day);
    const weekday = day.getUTCDay(); // start is midnight UTC of the Bangkok date, so this is the Bangkok weekday

    for (const t of templates) {
      if (t.weekday !== weekday) continue;
      candidates++;
      // Deterministic id -- this, not a uniqueness constraint, is what makes
      // re-running safe (tour_sessions has no natural UNIQUE on
      // tour+date+time, and adding one would be a migration on a table that
      // already has production rows inserted by hand).
      const id = `sess-${t.tour_id}-${date}-${t.start_time.replace(":", "")}`;
      statements.push(
        db
          .prepare(
            `INSERT INTO tour_sessions (id, tour_id, date, start_time, capacity, booked_count)
             VALUES (?1, ?2, ?3, ?4, ?5, 0)
             ON CONFLICT(id) DO NOTHING`
          )
          .bind(id, t.tour_id, date, t.start_time, t.capacity)
      );
    }
  }

  if (statements.length === 0) {
    return { created: 0, skipped: 0, windowEnd: isoDate(new Date(start.getTime() + windowDays * 86400000)) };
  }

  // batch() runs as one D1 transaction. Chunked because a 120-day window
  // across several templates is hundreds of statements, and an unbounded
  // batch is a good way to discover an undocumented limit in production.
  let created = 0;
  const CHUNK = 50;
  for (let i = 0; i < statements.length; i += CHUNK) {
    const res = await db.batch(statements.slice(i, i + CHUNK));
    for (const r of res) created += r.meta.changes;
  }

  return {
    created,
    skipped: candidates - created,
    windowEnd: isoDate(new Date(start.getTime() + windowDays * 86400000)),
  };
}
