-- Migration number: 0007 	 2026-07-11T14:35:33.204Z

-- Unified web-chat + WhatsApp inbox (plan §9). channel is an enum so LINE
-- (dropped, plan §14) or another channel can be added later without a
-- redesign -- additive, not structural.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('web','whatsapp')),
  guest_identifier TEXT NOT NULL, -- phone (whatsapp) or session id (web)
  status TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot','staff','closed')),
  assigned_staff_email TEXT REFERENCES staff(email),
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_conversations_channel_identifier ON conversations(channel, guest_identifier);

CREATE TABLE conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender TEXT NOT NULL CHECK (sender IN ('guest','bot','staff')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_conversation_messages_conversation ON conversation_messages(conversation_id);

-- Idempotency store for inbound Twilio webhooks (plan §9). id IS Twilio's
-- own event/message SID -- reuses the primary key's unique index for
-- idempotent inserts (INSERT OR IGNORE) instead of a second UNIQUE index,
-- which matters directly for write cost on a high-volume webhook table.
CREATE TABLE twilio_webhook_events (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL, -- JSON
  processed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TABLE twilio_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT REFERENCES conversations(id),
  twilio_message_sid TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  status TEXT,
  body TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_twilio_messages_conversation ON twilio_messages(conversation_id);
