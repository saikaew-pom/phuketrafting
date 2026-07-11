-- Migration number: 0008 	 2026-07-11T14:35:34.430Z

-- Idempotency store for Stripe webhooks (plan §4). id IS Stripe's own
-- evt_... id, same free-idempotency pattern as twilio_webhook_events.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  processed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- PDPA consent trail (plan §7): cookies, marketing opt-in, activity waiver
-- acknowledgment, WhatsApp opt-in -- each a separate recorded event so
-- "demonstrable consent" has a timestamp + IP, not just a boolean flag.
CREATE TABLE consent_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_email TEXT,
  booking_id TEXT REFERENCES bookings(id),
  consent_type TEXT NOT NULL CHECK (consent_type IN ('cookies','marketing','waiver','whatsapp_optin')),
  granted INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_consent_records_email ON consent_records(subject_email);
