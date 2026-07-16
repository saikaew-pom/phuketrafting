import { getDb } from "@/lib/db";

/**
 * Typed access to the key-value `settings` table (migrations/0001), which has
 * existed since Phase 1 but had no reader until now. Its own migration
 * comment lists what it's for: "WhatsApp number, chatbot mode toggles, Stripe
 * mode, notification recipients, business hours, PDPA contact, cancellation
 * window, deposit %, TAT/insurance placeholders, chatbot daily token cap."
 *
 * The table is deliberately key-value with a JSON-encoded `value` so new
 * settings never need a migration. The cost of that flexibility is that
 * nothing in the schema constrains what a row contains -- a hand-edited row
 * can hold any JSON at all, or invalid JSON. So this module is the one place
 * that turns those untrusted strings into typed values, and every getter
 * falls back to a documented default rather than throwing: a malformed
 * settings row must never take down the booking flow. Plan §4 requires the
 * payment policy be "adjustable without code changes", which only holds if a
 * bad edit degrades to the default instead of a 500.
 */

/**
 * Plan §4: "25% deposit at booking, balance payable on arrival ... Settings
 * still support full-prepay and pay-on-day modes so the policy stays
 * adjustable without code changes."
 */
export type PaymentMode = "deposit" | "full_prepay" | "pay_on_day";

export interface PaymentPolicy {
  mode: PaymentMode;
  /** Fraction of total taken up front in `deposit` mode. 0.25 = 25%. */
  depositRate: number;
  /**
   * How long a seat is held for a guest who started checkout but hasn't paid.
   *
   * ONE number drives two things that must never disagree: the Stripe
   * Checkout session's expires_at, and the sweeper cron's cutoff. If the
   * session outlived the sweeper, a guest could pay on a page we'd already
   * cancelled and freed the seat from -- markBookingPaid is guarded on
   * awaiting_payment, so it would no-op and they'd have paid for nothing.
   */
  holdMinutes: number;
  /**
   * Hours before departure up to which a guest may cancel/reschedule free and
   * get the deposit back (plan §4's proposed 72h).
   *
   * NOT client-confirmed. Plan §14's "Still open" list item 2 is explicit:
   * "Cancellation window -- sign off the proposed 72-hour free-cancellation
   * rule in §4 (deposit refund mechanics depend on it)." It lives in settings
   * precisely so signing off a different number is a data change, not a
   * deploy. Everything that reads it must treat it as a real business rule
   * that may move.
   */
  cancellationWindowHours: number;
}

// Plan §4 calls the 25% split "confirmed by client", so it's the default
// rather than a guess. `deposit` mode likewise. 30 minutes is the user's
// chosen hold window and also Stripe's own minimum for expires_at.
export const DEFAULT_PAYMENT_POLICY: PaymentPolicy = {
  mode: "deposit",
  depositRate: 0.25,
  holdMinutes: 30,
  cancellationWindowHours: 72,
};

// Stripe rejects an expires_at outside this range, so the setting is clamped
// to what Stripe will actually accept -- a hand-edited 5 would otherwise fail
// every checkout at the API call, which is a total booking outage rather than
// a degraded setting.
//
// Both bounds verified against the live API rather than read off the docs:
//   - expires_at < created + 1800 is rejected ("must be at least 30 minutes
//     from Checkout Session creation"), though there is ~60s of slack in
//     practice (created+1740 was accepted, created+1700 was not).
//   - expires_at > created + 86400 is rejected ("must be less than 24 hours
//     from Checkout Session creation"). The bound is INCLUSIVE of 86400
//     exactly: a delta of 86400 is accepted, 86401 is not.
//
// MAX is 1439, not 1440, on purpose. payments.ts computes
// expires_at = OUR clock's now + hold*60, but Stripe validates against ITS
// clock at receipt. At 1440 the delta is exactly 86400 -- the last accepted
// value -- so the request survives only while our clock is not ahead of
// Stripe's. Network latency subtracts from the delta and thus helps, but any
// forward skew larger than that latency (~0.6s observed) pushes it to 86401
// and EVERY checkout fails. One minute of headroom costs the business nothing
// and removes a total-outage failure mode that depends on clock luck.
const MIN_HOLD_MINUTES = 30;
const MAX_HOLD_MINUTES = 24 * 60 - 1;

const PAYMENT_POLICY_KEY = "payment_policy";

const VALID_MODES: readonly PaymentMode[] = ["deposit", "full_prepay", "pay_on_day"];

async function readSetting(key: string, dbOverride?: D1Database): Promise<unknown> {
  const row = await (dbOverride ?? getDb())
    .prepare("SELECT value FROM settings WHERE key = ?1")
    .bind(key)
    .first<{ value: string }>();
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    // `value` is TEXT with no CHECK constraint -- a hand-edited row can hold
    // anything. Caller falls back to its default.
    console.error(`settings: "${key}" is not valid JSON, ignoring`);
    return undefined;
  }
}

/**
 * The payment policy, or DEFAULT_PAYMENT_POLICY if unset/malformed.
 *
 * Every field is validated independently: a row that sets a valid mode but a
 * nonsense depositRate keeps the valid half and defaults the rest, rather
 * than discarding the staff's whole edit. depositRate is range-checked to
 * (0, 1] -- 0 would mean "deposit mode that charges nothing", which is
 * pay_on_day expressed confusingly, and >1 would charge more than the total.
 */
export async function getPaymentPolicy(dbOverride?: D1Database): Promise<PaymentPolicy> {
  // dbOverride is for the expiry sweeper, which runs in scheduled() where
  // getDb() has no request context -- see queries/notifications.ts.
  const raw = await readSetting(PAYMENT_POLICY_KEY, dbOverride);
  if (!raw || typeof raw !== "object") return DEFAULT_PAYMENT_POLICY;

  const value = raw as Record<string, unknown>;
  const mode = VALID_MODES.includes(value.mode as PaymentMode)
    ? (value.mode as PaymentMode)
    : DEFAULT_PAYMENT_POLICY.mode;

  const rate = value.depositRate;
  const depositRate =
    typeof rate === "number" && Number.isFinite(rate) && rate > 0 && rate <= 1
      ? rate
      : DEFAULT_PAYMENT_POLICY.depositRate;

  // Clamped rather than rejected-to-default: an out-of-range hold is a staff
  // member expressing a real intent ("hold longer/shorter"), and honouring the
  // nearest legal value is closer to that intent than silently reverting to 30.
  // Anything non-numeric IS reverted -- that's a broken row, not an intent.
  const hold = value.holdMinutes;
  const holdMinutes =
    typeof hold === "number" && Number.isFinite(hold)
      ? Math.min(Math.max(Math.round(hold), MIN_HOLD_MINUTES), MAX_HOLD_MINUTES)
      : DEFAULT_PAYMENT_POLICY.holdMinutes;

  // Bounded to something a human could mean: 0 (no free window at all) up to
  // 30 days. Unlike holdMinutes there's no external API constraining this --
  // the bound exists so a typo'd 720000 can't silently make every booking
  // refundable forever.
  const window = value.cancellationWindowHours;
  const cancellationWindowHours =
    typeof window === "number" && Number.isFinite(window) && window >= 0 && window <= 24 * 30
      ? Math.round(window)
      : DEFAULT_PAYMENT_POLICY.cancellationWindowHours;

  return { mode, depositRate, holdMinutes, cancellationWindowHours };
}

/**
 * Whether a booking departing at `departureDate` (YYYY-MM-DD) is still inside
 * the free-cancellation window.
 *
 * Departure is treated as the START of that day in Thailand -- tours leave in
 * the morning, and the guest-facing promise is "72 hours before departure",
 * not "before the end of departure day". Erring the other way would quietly
 * hand out refunds up to a day later than the policy states.
 *
 * Returns null when there's no date to measure against (a camp booking with no
 * check_in, a malformed date). Callers must NOT treat null as "inside" -- it
 * means "we can't say", and a human decides.
 */
export function isWithinCancellationWindow(
  departureDate: string | null,
  windowHours: number,
  now: Date = new Date()
): boolean | null {
  if (!departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return null;
  const parsed = new Date(`${departureDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // The regex and the NaN check together are NOT enough. JS only range-checks
  // an ISO date's month (<=12) and day (<=31): "2026-07-32" is correctly
  // Invalid Date, but "2026-02-30" is NOT -- it silently rolls over to
  // 2026-03-02, and "2026-02-29" (non-leap) to 2026-03-01. Left unchecked,
  // a booking carrying a day-of-month that doesn't exist would have its free
  // window measured against a departure up to three days later than the date
  // on the row -- i.e. a confident `true` promising a refund we never owed --
  // where this function's contract says "we can't tell" (null). Round-trip
  // the parse so only a real calendar date survives. Reachable: `date` is
  // COALESCE(tour_sessions.date, bookings.check_in), and check_in has no
  // format constraint in the schema or in camp-booking-actions' Zod schema
  // (both only require a non-empty string).
  if (parsed.toISOString().slice(0, 10) !== departureDate) return null;
  // Thailand is UTC+7 year-round (no DST), so 00:00 ICT is 17:00 UTC the day
  // before -- same fixed-offset reasoning as the notification cron's
  // thailandDateOffset.
  const departureUtcMs = parsed.getTime() - 7 * 60 * 60 * 1000;
  return departureUtcMs - now.getTime() >= windowHours * 60 * 60 * 1000;
}

/**
 * Chatbot configuration (plan §9's two toggles + the cost controls).
 *
 * The toggles are separate on purpose: plan §9 says "Info mode first ... then
 * booking mode behind its own settings toggle". Info mode only reads and
 * talks; booking mode writes a draft a guest can turn into a real booking.
 * Being able to kill the second without losing the first is the point -- if
 * the bot ever mis-books, staff turn off booking and keep a useful assistant,
 * rather than choosing between a liability and nothing.
 */
export interface ChatPolicy {
  /** Master switch. Off = the widget never renders and /api/chat declines. */
  enabled: boolean;
  /** Off = info mode only (the launch default, per plan §9). */
  bookingMode: boolean;
  /**
   * Hard ceiling on tokens spent per Bangkok day, across ALL guests.
   *
   * The only true spend ceiling that exists -- see queries/chat-spend.ts on
   * why the per-session cap isn't one. 400k tokens/day is roughly a few
   * hundred real conversations at this prompt size; generous for the traffic
   * this business sees, and cheap insurance against a scripted abuser.
   */
  dailyTokenCap: number;
}

export const DEFAULT_CHAT_POLICY: ChatPolicy = { enabled: true, bookingMode: false, dailyTokenCap: 400_000 };

const CHAT_POLICY_KEY = "chat_policy";

export async function getChatPolicy(dbOverride?: D1Database): Promise<ChatPolicy> {
  const raw = await readSetting(CHAT_POLICY_KEY, dbOverride);
  if (!raw || typeof raw !== "object") return DEFAULT_CHAT_POLICY;
  const value = raw as Record<string, unknown>;

  // Each field independently validated, same stance as getPaymentPolicy: a row
  // with one good field and one broken one keeps the good half.
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CHAT_POLICY.enabled,
    bookingMode: typeof value.bookingMode === "boolean" ? value.bookingMode : DEFAULT_CHAT_POLICY.bookingMode,
    // Clamped at 0 rather than reverted: a staff member setting 0 means "stop
    // spending", which is a legitimate intent and must be honoured exactly --
    // reverting that to the 400k default would keep burning money against
    // their explicit instruction.
    dailyTokenCap:
      typeof value.dailyTokenCap === "number" && Number.isFinite(value.dailyTokenCap) && value.dailyTokenCap >= 0
        ? Math.round(value.dailyTokenCap)
        : DEFAULT_CHAT_POLICY.dailyTokenCap,
  };
}
