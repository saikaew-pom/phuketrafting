-- Migration number: 0011 	 2026-07-12T02:17:52.091Z

-- General contact/enquiry form submissions (plan §3/§12 Phase 3 exit
-- criteria) -- distinct from `bookings` (a specific tour/camp reservation)
-- and `conversations` (chatbot/WhatsApp threads, plan §9). "status" lets
-- staff triage without a dedicated dashboard screen yet (Phase 3 scope is
-- just the public-facing form + storage; a staff inbox view is later).
CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL DEFAULT 'web',
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_enquiries_status ON enquiries(status);
