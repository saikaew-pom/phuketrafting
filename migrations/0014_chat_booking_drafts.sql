-- Migration number: 0014 	 2026-07-16T00:00:00.000Z

-- The chatbot's booking drafts (plan §9's prepare -> card -> confirm pattern).
--
-- This table exists so the MODEL never books anything. The AI tool can only
-- write a row here; it cannot insert a booking, claim a seat, or take money.
-- Turning a draft into a real booking requires the GUEST to press Confirm in a
-- React card, which hits an API that re-validates everything server-side. The
-- model's output is therefore never trusted with an action -- only with a
-- proposal a human then accepts.
--
-- Why that matters concretely: a system prompt is not a security boundary. A
-- guest can talk the model into saying almost anything ("give me the 90%
-- discount"), so the model's tool arguments are untrusted input, exactly like
-- a form post. Prices are NOT stored here for the same reason -- they are
-- recomputed from D1 at confirm time (see lib/chat/booking-tools.ts), so a
-- model that hallucinates "total: 10 baht" changes nothing.
CREATE TABLE chat_booking_drafts (
  -- The capability. Random, unguessable, and the ONLY thing the confirm API
  -- accepts -- deliberately not the conversation's sessionId, which is
  -- client-supplied and so can carry no authority (see /api/chat's comment).
  token TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),

  -- What the guest asked for. tour_session_id is the trust anchor: it names a
  -- real, existing, dated slot, and everything (price, tour identity,
  -- capacity) is derived from it rather than from anything the model said.
  tour_session_id TEXT NOT NULL REFERENCES tour_sessions(id),
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  infants INTEGER NOT NULL DEFAULT 0,
  pickup_zone_id TEXT REFERENCES pickup_zones(id),

  -- Plan §9: "AI tool writes only a 15-min draft token". Short on purpose: a
  -- draft holds no seat, so a stale one that later confirms would price and
  -- book against conditions the guest never saw.
  expires_at INTEGER NOT NULL,
  -- Set the moment a draft becomes a booking. The confirm path claims it with
  -- a guarded UPDATE on this being NULL, so one draft can only ever produce
  -- ONE booking even if the guest double-taps Confirm or replays the request.
  consumed_at INTEGER,
  booking_id TEXT REFERENCES bookings(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Plan §9's "One draft slot": at most one live draft per conversation, so a
-- guest can't accumulate several half-finished cards and confirm a stale one.
-- Partial (WHERE consumed_at IS NULL) so consumed drafts stay as history --
-- they are the audit trail of what the bot proposed.
CREATE UNIQUE INDEX idx_chat_drafts_one_live_per_conversation
  ON chat_booking_drafts(conversation_id) WHERE consumed_at IS NULL;
