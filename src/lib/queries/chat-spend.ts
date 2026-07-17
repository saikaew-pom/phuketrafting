import { getDb } from "@/lib/db";

/**
 * The daily chat token-spend counter (plan §9: "Daily token-spend counter in
 * the settings table with a hard daily cap -- when hit, the bot degrades
 * gracefully to 'please WhatsApp us' instead of erroring").
 *
 * This is the ONLY real spend ceiling on the chatbot. The per-session message
 * cap is not one: `sessionId` is client-supplied, so rotating the uuid resets
 * it for free. Per-IP limiting slows one abuser but not a botnet, and neither
 * bounds total daily cost. This does.
 *
 * Stored in `settings` per the plan, as one JSON row holding {date, tokens}
 * rather than a new table -- no migration, and the row is directly readable
 * by staff.
 */

const SPEND_KEY = "chat_token_spend";

/**
 * The day boundary is Asia/Bangkok, not UTC.
 *
 * A UTC day would roll over at 07:00 Thailand time -- i.e. mid-morning, right
 * as guests start chatting -- so a cap hit on a busy evening would clear
 * itself hours before the business's day actually ends. Matches the
 * notification cron's thailandDateOffset reasoning.
 */
export function bangkokDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface ChatSpend {
  date: string;
  tokens: number;
}

export async function getChatSpend(now: Date = new Date()): Promise<ChatSpend> {
  const today = bangkokDay(now);
  const row = await getDb()
    .prepare("SELECT value FROM settings WHERE key = ?1")
    .bind(SPEND_KEY)
    .first<{ value: string }>();
  if (!row) return { date: today, tokens: 0 };

  try {
    const parsed = JSON.parse(row.value) as Partial<ChatSpend>;
    // A stale date means yesterday's total -- today's spend is 0. Reporting
    // yesterday's number would keep the bot capped into a new day.
    if (parsed.date !== today) return { date: today, tokens: 0 };
    return { date: today, tokens: typeof parsed.tokens === "number" && parsed.tokens >= 0 ? parsed.tokens : 0 };
  } catch {
    // Hand-edited/corrupt row. Reporting 0 fails OPEN (the bot keeps working)
    // rather than closed -- deliberate: this counter protects a bill, and a
    // malformed row is our bug, not a reason to take the chatbot down. The
    // cap still bites as soon as addChatTokens rewrites the row below.
    console.error("chat-spend: value is not valid JSON, treating as 0");
    return { date: today, tokens: 0 };
  }
}

/**
 * Adds `tokens` to today's total, atomically.
 *
 * Three guarded single statements rather than a read-modify-write, for the
 * reason D1 forces everywhere else: it has no BEGIN/COMMIT, so a
 * SELECT-then-UPDATE lets concurrent chats both read the same total and both
 * write it back -- silently undercounting spend, which is the one thing a
 * spend cap must never do.
 *
 * Order matters:
 *   1. increment if the row already holds TODAY (the hot path),
 *   2. else reset it to today (a stale row from a previous day, OR a corrupt
 *      one -- see below),
 *   3. else insert (first ever call).
 * Each is guarded so exactly one applies, whichever raced.
 *
 * Every json_extract is wrapped in `CASE WHEN json_valid(value) THEN ... END`
 * -- deliberately, and load-bearing: a hand-edited/corrupt row makes a bare
 * json_extract in a WHERE clause THROW ("malformed JSON"), not return NULL, so
 * without this the increment statement errors, the reset never runs, the row
 * is never repaired, and the daily cap is dead until a human fixes the row.
 * (getChatSpend already reads a corrupt row as 0, so the cap silently stops
 * biting.) With the CASE guard, a corrupt row simply fails the increment's
 * date match and falls through to the reset, which overwrites it with a valid
 * json_object -- repairing it. (Audit A15.)
 */
export async function addChatTokens(tokens: number, now: Date = new Date()): Promise<void> {
  const db = getDb();
  const today = bangkokDay(now);

  const bumped = await db
    .prepare(
      `UPDATE settings
          SET value = json_set(value, '$.tokens', json_extract(value, '$.tokens') + ?1),
              updated_at = unixepoch()
        WHERE key = ?2
          AND (CASE WHEN json_valid(value) THEN json_extract(value, '$.date') END) = ?3`
    )
    .bind(tokens, SPEND_KEY, today)
    .run();
  if (bumped.meta.changes > 0) return;

  // Row exists but is from another day OR is corrupt -- overwrite with today's
  // first spend. The CASE ELSE (a corrupt/invalid row) evaluates to 1 (true),
  // so this statement is what repairs a malformed row back to valid JSON.
  const reset = await db
    .prepare(
      `UPDATE settings SET value = json_object('date', ?1, 'tokens', ?2), updated_at = unixepoch()
        WHERE key = ?3
          AND (CASE WHEN json_valid(value) THEN json_extract(value, '$.date') != ?1 ELSE 1 END)`
    )
    .bind(today, tokens, SPEND_KEY)
    .run();
  if (reset.meta.changes > 0) return;

  // No row at all. ON CONFLICT DO NOTHING so a concurrent first-ever call
  // can't crash on the primary key; whichever loses simply retries the
  // increment path on its next turn. Undercounting one turn's tokens at the
  // very first call of a day is an acceptable rounding error.
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?1, json_object('date', ?2, 'tokens', ?3))
       ON CONFLICT (key) DO NOTHING`
    )
    .bind(SPEND_KEY, today, tokens)
    .run();
}
