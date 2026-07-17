-- Migration number: 0018 	 2026-07-17T10:00:00.000Z

-- Priced add-ons (plan §2: add-ons as a real priced entity, not the free-text
-- addon_choice note). Global catalog, flat price added once per booking -- a
-- guest ticks the ones they want and each adds its price to the total (and so
-- to the 25% deposit). The old bookings.addon_choice free-text column stays as
-- a staff note; this is the money-bearing entity.
CREATE TABLE addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  -- CHECK, not just app validation: price feeds the booking total (and the 25%
  -- deposit), so a negative value is a stealth discount. The DB is the last
  -- line -- a hand-edited row or a future code path can't slip one past it.
  price REAL NOT NULL CHECK (price >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Which add-ons a booking bought, with the name AND price SNAPSHOT at booking
-- time. Load-bearing: editing an add-on's price later must never rewrite what a
-- past booking paid -- the same reason bookings store their own total rather
-- than recomputing from live rates. addon_id is nullable so deleting an add-on
-- from the catalog doesn't orphan-fail this FK; the snapshot keeps the history
-- readable either way.
CREATE TABLE booking_addons (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  addon_id TEXT REFERENCES addons(id),
  name_at_booking TEXT NOT NULL,
  price_at_booking REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_booking_addons_booking ON booking_addons(booking_id);
