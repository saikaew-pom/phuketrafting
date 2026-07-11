-- Migration number: 0002 	 2026-07-11T14:35:26.774Z

-- Real SKUs from packages-data.jsx: 5.5km and 7.5km routes x 3 add-on tiers
-- (B1-B3, C1-C3) -- each SKU is its own bookable row, "code" carries the
-- legacy pricing-sheet code for staff familiarity (plan §3: fields must map
-- 1:1 to what staff already recognize).
CREATE TABLE tours (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  distance_km REAL,
  duration_label TEXT,
  min_group INTEGER,
  max_group INTEGER,
  includes TEXT NOT NULL DEFAULT '[]', -- JSON array
  badge TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Age-band pricing (plan §2: "full age-band rate support ... adjustable
-- later without migration"). Launch config is just two rows per tour
-- (0-5 free/no-capacity, 6+ adult price) but the table supports more bands
-- without a schema change.
CREATE TABLE tour_rates (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL REFERENCES tours(id),
  min_age INTEGER NOT NULL DEFAULT 0,
  max_age INTEGER, -- NULL = no upper bound
  label TEXT,
  price REAL NOT NULL,
  counts_toward_capacity INTEGER NOT NULL DEFAULT 1, -- infants under 6 = 0
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_tour_rates_tour ON tour_rates(tour_id);

-- Weekday -> time -> capacity pattern that auto-generates tour_sessions.
CREATE TABLE session_templates (
  id TEXT PRIMARY KEY,
  tour_id TEXT REFERENCES tours(id), -- NULL = shared river session across tours
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL, -- 'HH:MM'
  capacity INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- One row per departure. booked_count is a maintained counter (not derived
-- via SUM at read time) so capacity can be checked and claimed in ONE
-- guarded UPDATE statement -- D1 has no BEGIN/COMMIT, and this is the
-- race-free pattern confirmed for D1's single-primary/single-threaded
-- architecture (plan §1a). Guarded statement shape:
--   UPDATE tour_sessions
--      SET booked_count = booked_count + :delta
--    WHERE id = :id
--      AND booked_count + :delta <= capacity - allotment_hold
--      AND booked_count + :delta >= 0
--      AND is_blocked = 0
-- then check meta.changes -- 0 means no capacity, do not insert the booking.
-- :delta is negative for edits/cancellations, so the same statement handles
-- claim, release, and edit-in-place (the "excludeBookingId" requirement in
-- plan §2 becomes "adjust by the delta" rather than "recompute excluding one row").
CREATE TABLE tour_sessions (
  id TEXT PRIMARY KEY,
  tour_id TEXT REFERENCES tours(id),
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  start_time TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  booked_count INTEGER NOT NULL DEFAULT 0,
  guides_assigned TEXT, -- JSON array
  is_blocked INTEGER NOT NULL DEFAULT 0,
  block_reason TEXT,
  allotment_hold INTEGER NOT NULL DEFAULT 0, -- seats reserved for GetYourGuide
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_tour_sessions_date ON tour_sessions(date);
CREATE INDEX idx_tour_sessions_tour ON tour_sessions(tour_id);
