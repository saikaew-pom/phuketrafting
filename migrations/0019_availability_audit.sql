-- Migration number: 0019 	 2026-07-18T12:00:00.000Z

-- Audit trail for BULK availability changes (Availability redesign stage C).
-- Individual per-departure blocks already leave block_reason on the row; this
-- table is for the range operations ("close Jul 20-25", "reopen this month")
-- where "who did it, when, why, and to which departures" would otherwise be
-- invisible -- and it powers one-click Undo: session_ids is the exact set the
-- action touched, so undo reopens precisely those and nothing it didn't close.
CREATE TABLE availability_audit (
  id TEXT PRIMARY KEY,
  -- FK to staff.email, same audit column convention as settings.updated_by.
  actor_email TEXT NOT NULL REFERENCES staff(email),
  action TEXT NOT NULL CHECK (action IN ('bulk_close','bulk_reopen','bulk_capacity','undo')),
  tour_id TEXT REFERENCES tours(id),
  date_from TEXT,
  date_to TEXT,
  -- JSON array of the tour_session ids this action changed. The load-bearing
  -- column for Undo: reopen exactly these, never re-derive from a date range
  -- that may have changed since.
  session_ids TEXT NOT NULL DEFAULT '[]',
  reason TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  -- 1 once this action has been reversed by an undo, so its Undo button hides
  -- and it can't be undone twice.
  undone INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_availability_audit_created ON availability_audit(created_at);
