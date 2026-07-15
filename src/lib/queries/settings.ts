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
}

// Plan §4 calls the 25% split "confirmed by client", so it's the default
// rather than a guess. `deposit` mode likewise.
export const DEFAULT_PAYMENT_POLICY: PaymentPolicy = { mode: "deposit", depositRate: 0.25 };

const PAYMENT_POLICY_KEY = "payment_policy";

const VALID_MODES: readonly PaymentMode[] = ["deposit", "full_prepay", "pay_on_day"];

async function readSetting(key: string): Promise<unknown> {
  const row = await getDb().prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
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
export async function getPaymentPolicy(): Promise<PaymentPolicy> {
  const raw = await readSetting(PAYMENT_POLICY_KEY);
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

  return { mode, depositRate };
}
