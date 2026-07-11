-- Migration number: 0003 	 2026-07-11T14:35:28.052Z

-- Family / Outdoor / Private, from camping-data.jsx.
CREATE TABLE camp_zones (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  sleeps_label TEXT,
  amenities TEXT NOT NULL DEFAULT '[]', -- JSON array
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Physical tents/rooms -- the bookable inventory unit. Availability for a
-- date range = this unit has no overlapping pending/confirmed booking and
-- is not blocked (plan §2), checked via a guarded INSERT ... WHERE NOT
-- EXISTS (see bookings migration) rather than a maintained counter, since
-- camp availability is an overlap check, not a sum.
CREATE TABLE camp_units (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES camp_zones(id),
  name TEXT NOT NULL,
  occupancy INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  block_reason TEXT,
  ical_export_token TEXT UNIQUE, -- this unit's confirmed bookings, for Agoda/Booking.com to subscribe to
  ical_import_url TEXT, -- their feed, pulled by a Cron Trigger (plan §2, Phase 5b)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_camp_units_zone ON camp_units(zone_id);

-- Stay packages (Stay & Dine / Stay + Raft 5.5 / Stay + Raft 7.5 from
-- camping-data.jsx), priced per zone with separate weekday/weekend rates.
CREATE TABLE camp_rates (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES camp_zones(id),
  stay_type TEXT NOT NULL,
  includes_rafting_km REAL, -- 0, 5.5, or 7.5
  price_weekday REAL NOT NULL,
  price_weekend REAL NOT NULL,
  min_nights INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_camp_rates_zone ON camp_rates(zone_id);
