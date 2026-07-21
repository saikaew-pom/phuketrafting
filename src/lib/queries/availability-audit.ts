import { getDb } from "@/lib/db";

/**
 * The bulk-availability audit trail + the bulk operations themselves
 * (Availability redesign stage C). Every range action records exactly which
 * tour_session ids it touched, so the "Recent changes" list can show it and
 * Undo can reverse precisely that set -- not a date range that may have moved.
 */

export type AvailabilityAction = "bulk_close" | "bulk_reopen" | "bulk_capacity" | "undo";

export interface AvailabilityAuditRow {
  id: string;
  actor_email: string;
  action: AvailabilityAction;
  tour_id: string | null;
  date_from: string | null;
  date_to: string | null;
  session_ids: string; // JSON array
  reason: string | null;
  count: number;
  undone: number;
  created_at: number;
}

async function recordAudit(input: {
  actorEmail: string;
  action: AvailabilityAction;
  tourId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sessionIds: string[];
  reason: string | null;
  count: number;
}): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO availability_audit (id, actor_email, action, tour_id, date_from, date_to, session_ids, reason, count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(
      `avaud-${crypto.randomUUID().slice(0, 12)}`,
      input.actorEmail,
      input.action,
      input.tourId,
      input.dateFrom,
      input.dateTo,
      JSON.stringify(input.sessionIds),
      input.reason,
      input.count
    )
    .run();
}

export async function listRecentAvailabilityAudit(limit = 6): Promise<AvailabilityAuditRow[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, actor_email, action, tour_id, date_from, date_to, session_ids, reason, count, undone, created_at
         FROM availability_audit ORDER BY created_at DESC, id DESC LIMIT ?1`
    )
    .bind(limit)
    .all<AvailabilityAuditRow>();
  return results;
}

/**
 * Block every OPEN departure for a tour in a date range, in one guarded UPDATE.
 * Returns the ids it actually blocked (already-blocked ones are left alone, so
 * a re-run is a no-op) + the count, and records the audit. The ids are read
 * BEFORE the update from the same guard, so the audit's session_ids match
 * exactly what the update touched (staff-only, low-concurrency screen -- the
 * tiny read/write gap can't matter here the way it does on the booking path).
 */
export async function bulkCloseRange(
  tourId: string,
  from: string,
  to: string,
  reason: string,
  actorEmail: string
): Promise<number> {
  const db = getDb();
  const { results } = await db
    .prepare("SELECT id FROM tour_sessions WHERE tour_id = ?1 AND date >= ?2 AND date <= ?3 AND is_blocked = 0")
    .bind(tourId, from, to)
    .all<{ id: string }>();
  const ids = results.map((r) => r.id);
  if (ids.length === 0) return 0;

  await db
    .prepare(
      "UPDATE tour_sessions SET is_blocked = 1, block_reason = ?1, updated_at = unixepoch() WHERE tour_id = ?2 AND date >= ?3 AND date <= ?4 AND is_blocked = 0"
    )
    .bind(reason, tourId, from, to)
    .run();

  await recordAudit({ actorEmail, action: "bulk_close", tourId, dateFrom: from, dateTo: to, sessionIds: ids, reason, count: ids.length });
  return ids.length;
}

/** Reopen every blocked departure for a tour in a range. Mirror of bulkCloseRange. */
export async function bulkReopenRange(
  tourId: string,
  from: string,
  to: string,
  actorEmail: string
): Promise<number> {
  const db = getDb();
  const { results } = await db
    .prepare("SELECT id FROM tour_sessions WHERE tour_id = ?1 AND date >= ?2 AND date <= ?3 AND is_blocked = 1")
    .bind(tourId, from, to)
    .all<{ id: string }>();
  const ids = results.map((r) => r.id);
  if (ids.length === 0) return 0;

  await db
    .prepare(
      "UPDATE tour_sessions SET is_blocked = 0, block_reason = NULL, updated_at = unixepoch() WHERE tour_id = ?1 AND date >= ?2 AND date <= ?3 AND is_blocked = 1"
    )
    .bind(tourId, from, to)
    .run();

  await recordAudit({ actorEmail, action: "bulk_reopen", tourId, dateFrom: from, dateTo: to, sessionIds: ids, reason: null, count: ids.length });
  return ids.length;
}

/**
 * Set capacity for every departure in a range, in ONE guarded UPDATE that skips
 * any departure it would oversell (same `capacity - allotment_hold >=
 * booked_count` invariant as the single-session setter). Returns how many were
 * actually changed; the difference from the range size is the ones skipped
 * because guests are already on them. No undo (we don't snapshot prior
 * capacities) -- staff re-enter a number, which is cheap and unambiguous.
 */
export async function bulkSetCapacityRange(
  tourId: string,
  from: string,
  to: string,
  capacity: number,
  actorEmail: string
): Promise<{ changed: number; total: number }> {
  const db = getDb();
  const total = await db
    .prepare("SELECT COUNT(*) AS n FROM tour_sessions WHERE tour_id = ?1 AND date >= ?2 AND date <= ?3")
    .bind(tourId, from, to)
    .first<{ n: number }>();

  const result = await db
    .prepare(
      `UPDATE tour_sessions SET capacity = ?1, updated_at = unixepoch()
        WHERE tour_id = ?2 AND date >= ?3 AND date <= ?4 AND ?1 - allotment_hold >= booked_count`
    )
    .bind(capacity, tourId, from, to)
    .run();
  const changed = result.meta.changes ?? 0;

  await recordAudit({
    actorEmail,
    action: "bulk_capacity",
    tourId,
    dateFrom: from,
    dateTo: to,
    sessionIds: [],
    reason: `set to ${capacity}`,
    count: changed,
  });
  return { changed, total: total?.n ?? 0 };
}

/**
 * Undo a bulk_close: reopen the departures it blocked -- but ONLY the ones that
 * are still blocked AND still carry this bulk close's own reason. If staff
 * re-closed one of those dates for a DIFFERENT reason afterwards (a private
 * charter, maintenance), that's a deliberate decision the undo must not silently
 * revert -- reopening it would make a date staff meant to keep shut bookable
 * again. Matching on the reason skips those; an identical-reason re-close is
 * treated as the same closure (acceptable). Marks the original undone and
 * records an 'undo' row. Only bulk_close is undoable (reopen/capacity have no
 * clean inverse). Returns how many were reopened.
 */
export async function undoBulkClose(auditId: string, actorEmail: string): Promise<number> {
  const db = getDb();
  const row = await db
    .prepare("SELECT action, session_ids, undone, tour_id, date_from, date_to, reason FROM availability_audit WHERE id = ?1")
    .bind(auditId)
    .first<Pick<AvailabilityAuditRow, "action" | "session_ids" | "undone" | "tour_id" | "date_from" | "date_to" | "reason">>();
  if (!row || row.action !== "bulk_close" || row.undone === 1) return 0;

  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.session_ids);
    ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  if (ids.length === 0) {
    await db.prepare("UPDATE availability_audit SET undone = 1 WHERE id = ?1").bind(auditId).run();
    return 0;
  }

  // ?1 = the bulk close's reason (skips a date re-closed for a different one),
  // ?2.. = the recorded ids. block_reason is non-null on a bulk-closed row, so
  // `=` is the right comparison.
  //
  // Chunked to <=99 ids per statement -- a single UPDATE with one placeholder
  // per session id hits D1's 100-bound-parameter ceiling once the closed
  // range is large enough (a tour running 2 departures/day only needs ~50
  // days to get there; parseRange allows up to 366). The undo button existed
  // specifically for a mistaken bulk close, so it dying on exactly the large
  // ranges most likely to BE a mistake -- while the close itself succeeded --
  // left staff to reopen hundreds of departures by hand. Same chunk-and-sum
  // shape as session-generator.ts, adapted for one big IN(...) list instead
  // of many independent single-row statements.
  //
  // Each chunk is its own db.batch() call, same as that precedent -- not one
  // batch spanning every chunk, so this is retry-safe rather than
  // all-or-nothing: if a later chunk throws, the WHERE clause (is_blocked = 1
  // AND block_reason = ?1) is naturally idempotent, so re-running the whole
  // undo only touches whatever chunk 1..k already reopened is now a no-op --
  // no double-application risk, and staff can just retry.
  const CHUNK = 99;
  let reopened = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const placeholders = slice.map((_, j) => `?${j + 2}`).join(",");
    const [result] = await db.batch([
      db
        .prepare(
          `UPDATE tour_sessions SET is_blocked = 0, block_reason = NULL, updated_at = unixepoch()
            WHERE is_blocked = 1 AND block_reason = ?1 AND id IN (${placeholders})`
        )
        .bind(row.reason, ...slice),
    ]);
    reopened += result.meta.changes ?? 0;
  }

  await db.prepare("UPDATE availability_audit SET undone = 1 WHERE id = ?1").bind(auditId).run();
  await recordAudit({
    actorEmail,
    action: "undo",
    tourId: row.tour_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    sessionIds: ids,
    reason: "undo of bulk close",
    count: reopened,
  });
  return reopened;
}
