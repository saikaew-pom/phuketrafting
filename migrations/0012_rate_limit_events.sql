-- Migration number: 0012 	 2026-07-12T00:00:00.000Z

-- Generic rate-limit tracker for public write endpoints (enquiry form today;
-- any future unauthenticated POST -- booking, newsletter signup -- reuses
-- the same `bucket` convention: "<endpoint>:<ip>"). Append-only log, so
-- INTEGER PRIMARY KEY AUTOINCREMENT per plan §"D1 architectural facts"
-- rather than a TEXT UUID. Rows are cheap and short-lived; no cron cleanup
-- yet since a contact form's volume doesn't warrant it, but the index below
-- keeps the window-count query fast if that changes.
CREATE TABLE rate_limit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_rate_limit_events_bucket_created ON rate_limit_events(bucket, created_at);
