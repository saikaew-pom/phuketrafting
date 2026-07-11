-- Migration number: 0005 	 2026-07-11T14:35:30.743Z

-- id is a TEXT UUID generated in Worker code (crypto.randomUUID()) BEFORE
-- insert -- D1/SQLite has no built-in UUID function, and this booking's id
-- must exist before the Stripe Checkout Session is created (it's embedded
-- in the session so the webhook can find the row back). type='tour' uses
-- tour_session_id (capacity via the guarded counter on tour_sessions);
-- type='camp' uses camp_unit_id + check_in/check_out (capacity via the
-- guarded overlap-check INSERT below).
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('tour','camp')),
  tour_session_id TEXT REFERENCES tour_sessions(id),
  camp_unit_id TEXT REFERENCES camp_units(id),
  check_in TEXT, -- 'YYYY-MM-DD', camp only
  check_out TEXT, -- 'YYYY-MM-DD', camp only (exclusive)
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  infants INTEGER NOT NULL DEFAULT 0, -- under 6: free, no activity capacity, still on the manifest/transfer count
  hotel TEXT,
  pickup_zone_id TEXT REFERENCES pickup_zones(id),
  transfer_fee REAL NOT NULL DEFAULT 0,
  addon_choice TEXT, -- e.g. 'atv' | 'elephant' for choice-based tiers
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  deposit_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL CHECK (source IN ('web','chatbot','whatsapp','staff','ota','agent')),
  booked_by_agent_id TEXT REFERENCES agents(id),
  promo_code_id TEXT REFERENCES promo_codes(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  checked_in INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (payment_status IN ('awaiting_payment','paid','refunded','failed')),
  stripe_checkout_session_id TEXT,
  manage_token TEXT UNIQUE, -- signed token for the guest self-service link
  last_email_sent_at INTEGER,
  last_email_status TEXT,
  last_whatsapp_sent_at INTEGER,
  last_whatsapp_status TEXT,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  waiver_acknowledged INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_bookings_tour_session ON bookings(tour_session_id);
CREATE INDEX idx_bookings_camp_unit ON bookings(camp_unit_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE UNIQUE INDEX idx_bookings_manage_token ON bookings(manage_token);

-- Per-participant waiver (plan §7): the booker's own consent checkbox does
-- not cover companions -- each rafter needs their own declaration.
CREATE TABLE booking_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  name TEXT NOT NULL,
  age INTEGER,
  health_declaration TEXT,
  waiver_signed_at INTEGER,
  signature_text TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_booking_participants_booking ON booking_participants(booking_id);

-- Append-only audit trail on every booking mutation (plan §2). Deliberately
-- no FK cascade -- a parent booking can never be deleted out from under its
-- log rows (D1 enforces FKs with no implicit cascade by default). Deliberately
-- minimal indexes: D1 bills at least 1 extra row-written per index touched
-- per write, and this is the highest-insert-rate table in the schema.
CREATE TABLE booking_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  actor TEXT NOT NULL, -- staff email, or 'system'
  action TEXT NOT NULL,
  details TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_booking_logs_booking ON booking_logs(booking_id);
