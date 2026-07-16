import { getDb } from "@/lib/db";

/**
 * The unified conversation store (migration 0007), first reader/writer here.
 *
 * Plan §9 wants ONE inbox across web chat and WhatsApp ("Unified conversations
 * storage across web chat + WhatsApp; dashboard inbox with staff takeover"),
 * which is why `channel` is an enum on the thread rather than there being a
 * separate web_chats table. Twilio (Phase 8) writes rows with channel
 * 'whatsapp' into these same two tables.
 */

export type ConversationChannel = "web" | "whatsapp";
export type ConversationStatus = "bot" | "staff" | "closed";
export type MessageSender = "guest" | "bot" | "staff";

export interface Conversation {
  id: string;
  channel: string;
  guest_identifier: string;
  status: string;
  assigned_staff_email: string | null;
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationMessage {
  id: number;
  conversation_id: string;
  sender: string;
  content: string;
  created_at: number;
}

/**
 * Finds this guest's open thread, or starts one.
 *
 * `guest_identifier` is the web session id (or the phone number, for
 * WhatsApp) -- see the column's own comment in migration 0007. A `closed`
 * thread is deliberately NOT reused: staff closing a conversation means "this
 * is done", and silently reopening it would resurrect a resolved thread in
 * their inbox. A guest who comes back gets a fresh thread instead.
 */
export async function findOrCreateConversation(
  channel: ConversationChannel,
  guestIdentifier: string
): Promise<Conversation> {
  const db = getDb();

  const existing = await db
    .prepare(
      `SELECT id, channel, guest_identifier, status, assigned_staff_email, last_message_at, created_at
         FROM conversations
        WHERE channel = ?1 AND guest_identifier = ?2 AND status != 'closed'
        ORDER BY created_at DESC
        LIMIT 1`
    )
    .bind(channel, guestIdentifier)
    .first<Conversation>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO conversations (id, channel, guest_identifier, last_message_at) VALUES (?1, ?2, ?3, unixepoch())")
    .bind(id, channel, guestIdentifier)
    .run();

  const created = await db
    .prepare(
      `SELECT id, channel, guest_identifier, status, assigned_staff_email, last_message_at, created_at
         FROM conversations WHERE id = ?1`
    )
    .bind(id)
    .first<Conversation>();
  if (!created) throw new Error(`conversation ${id} vanished immediately after insert`);
  return created;
}

/** Appends a message and bumps the thread's last_message_at, atomically. */
export async function appendMessage(conversationId: string, sender: MessageSender, content: string): Promise<void> {
  const db = getDb();
  // db.batch so the thread's last_message_at can never drift from its
  // messages -- the inbox sorts on it, and a message whose thread still shows
  // an old timestamp sinks below newer threads and gets missed. One
  // transaction, same reasoning as the booking writes.
  await db.batch([
    db
      .prepare("INSERT INTO conversation_messages (conversation_id, sender, content) VALUES (?1, ?2, ?3)")
      .bind(conversationId, sender, content),
    db.prepare("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?1").bind(conversationId),
  ]);
}

/**
 * The thread's recent messages, oldest first, capped.
 *
 * The cap is the conversation-history truncation window plan §9 requires under
 * "Chatbot cost & abuse control (MiniMax bills per token)": every past message
 * is re-sent as input tokens on every turn, so an uncapped history makes each
 * reply progressively more expensive and eventually blows the context window.
 * Fetching the newest N and reversing (rather than the oldest N) keeps the
 * turns the model actually needs -- what was just said.
 */
export async function listRecentMessages(conversationId: string, limit: number): Promise<ConversationMessage[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, conversation_id, sender, content, created_at
         FROM conversation_messages
        WHERE conversation_id = ?1
        ORDER BY id DESC
        LIMIT ?2`
    )
    .bind(conversationId, limit)
    .all<ConversationMessage>();
  return results.reverse();
}

/** How many guest turns this thread has had -- feeds the per-session cap. */
export async function countGuestMessages(conversationId: string): Promise<number> {
  const row = await getDb()
    .prepare("SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?1 AND sender = 'guest'")
    .bind(conversationId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
