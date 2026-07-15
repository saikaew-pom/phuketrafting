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
}

// Plan §4 calls the 25% split "confirmed by client", so it's the default
// rather than a guess. `deposit` mode likewise. 30 minutes is the user's
// chosen hold window and also Stripe's own minimum for expires_at.
export const DEFAULT_PAYMENT_POLICY: PaymentPolicy = { mode: "deposit", depositRate: 0.25, holdMinutes: 30 };

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

  return { mode, depositRate, holdMinutes };
}
