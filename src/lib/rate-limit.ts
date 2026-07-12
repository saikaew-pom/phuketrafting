import { getDb } from "@/lib/db";

/**
 * D1-based fixed-window rate limiter. Chosen over Cloudflare's native
 * Workers Rate Limiting binding to avoid a repeat of the Phase 2 Cloudflare
 * Images surprise (a Cloudflare product silently requiring a paid plan) --
 * this works identically on any account tier, local preview, staging, and
 * production, using infrastructure this project already has.
 *
 * `bucket` should be "<endpoint>:<identity>", e.g. "enquiry:203.0.113.5".
 * Returns true if the caller is still under `limit` events within the last
 * `windowSeconds`, and records this attempt. Returns false (rate limited)
 * without recording anything further.
 *
 * D1 has no BEGIN/COMMIT (see the "guarded single UPDATE statement" pattern
 * in migrations/0002_tours_and_sessions.sql), so a check-then-conditionally-
 * insert shape is a TOCTOU race: concurrent callers can all read the same
 * stale count and all pass. Insert unconditionally first, then count
 * (inclusive of the row just written) to decide -- an append can't race with
 * itself, and counting after your own insert means concurrent siblings are
 * always reflected, so a burst can never exceed `limit` regardless of
 * interleaving. Also opportunistically prunes this bucket's rows outside the
 * window on every call, since nothing else ever reads or deletes them once
 * they age out (see migration 0012's comment on the lack of a cron sweep).
 */
export async function checkRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = getDb();
  const windowStart = Math.floor(Date.now() / 1000) - windowSeconds;

  await db.prepare("INSERT INTO rate_limit_events (bucket) VALUES (?1)").bind(bucket).run();

  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE bucket = ?1 AND created_at > ?2")
    .bind(bucket, windowStart)
    .first<{ count: number }>();

  await db.prepare("DELETE FROM rate_limit_events WHERE bucket = ?1 AND created_at <= ?2").bind(bucket, windowStart).run();

  return (row?.count ?? 0) <= limit;
}
