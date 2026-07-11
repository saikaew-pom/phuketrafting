-- Migration number: 0004 	 2026-07-11T14:35:29.502Z

-- Seasonal rate overrides. scope_type/scope_id is a polymorphic reference
-- (tours or camp_zones) -- not FK-enforceable across two target tables in
-- SQLite, validated in application code instead. Launch config: no rows
-- (single season); table exists so seasonal rates are a data change later,
-- not a migration (plan §2).
CREATE TABLE rate_periods (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('tour','camp_zone')),
  scope_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  price_multiplier REAL,
  price_override REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_rate_periods_scope ON rate_periods(scope_type, scope_id);
CREATE INDEX idx_rate_periods_dates ON rate_periods(start_date, end_date);

CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value REAL NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  usage_cap INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  scope_tour_id TEXT REFERENCES tours(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- B2B agent bookings (plan §2).
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commission_percent REAL NOT NULL DEFAULT 0,
  contact_email TEXT,
  contact_phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Phuket/Khao Lak pickup areas, from packages-data.jsx's PICKUP table.
CREATE TABLE pickup_zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  earliest_pickup_time TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
