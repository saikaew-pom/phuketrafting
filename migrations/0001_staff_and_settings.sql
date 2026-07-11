-- Migration number: 0001 	 2026-07-11T14:35:25.186Z

-- Cloudflare Access confirms *who* (email); this table is the only source of
-- truth for *what they can do* (role) -- Access has no role/group concept
-- under OTP email login. See BUILD_AND_DEPLOY_PLAN.md §1a.
CREATE TABLE staff (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Key-value settings: WhatsApp number, chatbot mode toggles, Stripe mode,
-- notification recipients, business hours, PDPA contact, cancellation
-- window, deposit %, TAT/insurance placeholders, chatbot daily token cap.
-- Key-value (not fixed columns) so new settings don't need a migration.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON-encoded
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by TEXT REFERENCES staff(email)
) STRICT;
