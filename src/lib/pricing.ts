import { getDb } from "@/lib/db";
import { getPaymentPolicy, type PaymentPolicy } from "@/lib/queries/settings";

/**
 * Pricing depth on top of the raw rate tables (plan §2: "child/seasonal/
 * promo/agent fields"). All tables here are real schema from Phase 1
 * (migrations/0002, 0004) but currently hold launch-config data only --
 * rate_periods and promo_codes have zero rows today, so every booking uses
 * base rates until staff add seasonal/promo rows (a data change, not a
 * migration, per those tables' own doc comments).
 */

export interface PriceBreakdown {
  subtotal: number;
  discountAmount: number;
  transferFee: number;
  total: number;
  promoApplied: { code: string; discountAmount: number } | null;
  /**
   * What the guest pays now vs on the day (plan §4's 25/75 split). Always
   * sums to exactly `total` -- see splitPayment. Part of the breakdown rather
   * than computed per-caller so the widget preview, the persisted booking row
   * and the emails cannot disagree, which plan §13's checklist calls out
   * explicitly: "Deposit math: widget/chatbot/email all show identical
   * 25%/75% split".
   */
  depositAmount: number;
  balanceAmount: number;
}

/**
 * Splits a total into (pay now, pay on the day) per the configured policy.
 *
 * `balance` is derived by SUBTRACTION, never by its own rounding: deposit +
 * balance must equal total exactly, and rounding both halves independently
 * loses or invents money on any total that doesn't divide cleanly (25% of
 * ฿3,333 is ฿833.25 -- round both and you get ฿833 + ฿2,500 = ฿3,333 only by
 * luck). THB is quoted in whole baht throughout this app, so the deposit is
 * rounded to a whole baht and the balance absorbs the remainder.
 *
 * Exported for direct testing and reuse; callers normally get these via
 * PriceBreakdown.
 */
export function splitPayment(total: number, policy: PaymentPolicy): { depositAmount: number; balanceAmount: number } {
  if (policy.mode === "full_prepay") return { depositAmount: total, balanceAmount: 0 };
  if (policy.mode === "pay_on_day") return { depositAmount: 0, balanceAmount: total };

  const depositAmount = Math.round(total * policy.depositRate);
  return { depositAmount, balanceAmount: total - depositAmount };
}

interface TourRateRow {
  id: string;
  min_age: number;
  price: number;
  counts_toward_capacity: number;
}

/**
 * bookings stores three fixed counts (adults/children/infants), not
 * per-age-band counts, even though tour_rates supports arbitrary age bands.
 * Today's real data has exactly two bands per tour (a free 0-5 band and one
 * paid 6+ band), so children and adults both use the lowest-min-age PAID
 * band and infants use the lowest-min-age FREE (counts_toward_capacity=0)
 * band. If a genuinely separate child-discount band is ever added, this
 * function -- and the adults/children/infants input shape it's built
 * around -- both need revisiting together; not solved here since no such
 * band exists to test against yet.
 */
function pickAgeBandRates(rates: TourRateRow[]): { freeRate: number; paidRate: number } {
  const sorted = [...rates].sort((a, b) => a.min_age - b.min_age);
  const free = sorted.find((r) => r.counts_toward_capacity === 0);
  const paid = sorted.find((r) => r.counts_toward_capacity !== 0);
  // A missing paid band (no tour_rates rows at all, or a data-entry mistake
  // that leaves every row counts_toward_capacity=0) must NOT silently default
  // to 0 -- that would price a real paying group's adults/children at THB 0
  // with no error signal. Fail loudly instead; a missing *free* band is left
  // defaulting to 0 (infants ride free) since that's a defensible reading of
  // "no infant band configured for this tour" rather than a pricing gap.
  if (!paid) {
    throw new Error(
      `No paid tour_rates band (counts_toward_capacity != 0) found${
        sorted.length === 0 ? " -- tour has zero tour_rates rows" : ""
      }; cannot price adults/children.`
    );
  }
  return { freeRate: free?.price ?? 0, paidRate: paid.price };
}

/** Active seasonal override (if any) for a tour or camp zone on a given date. */
async function getActiveRatePeriod(
  scopeType: "tour" | "camp_zone",
  scopeId: string,
  date: string
): Promise<{ price_multiplier: number | null; price_override: number | null } | null> {
  return getDb()
    .prepare(
      `SELECT price_multiplier, price_override
         FROM rate_periods
        WHERE scope_type = ?1 AND scope_id = ?2 AND is_active = 1
          AND ?3 >= start_date AND ?3 <= end_date
        ORDER BY start_date DESC
        LIMIT 1`
    )
    .bind(scopeType, scopeId, date)
    .first<{ price_multiplier: number | null; price_override: number | null }>();
}

/** Applies a seasonal period to a base price -- override wins if both are set on the same row. */
function applyRatePeriod(basePrice: number, period: { price_multiplier: number | null; price_override: number | null } | null): number {
  if (!period) return basePrice;
  if (period.price_override != null) return period.price_override;
  if (period.price_multiplier != null) return basePrice * period.price_multiplier;
  return basePrice;
}

export interface PromoLookupResult {
  valid: boolean;
  reason?: "not_found" | "inactive" | "expired" | "not_yet_valid" | "usage_cap_reached" | "wrong_tour";
  promo?: {
    id: string;
    code: string;
    discountType: "percent" | "fixed";
    discountValue: number;
  };
}

/** Validates a promo code against today's date, usage cap, and (if scoped) the tour being booked. */
export async function lookupPromoCode(code: string, tourId: string | null, today: string): Promise<PromoLookupResult> {
  const row = await getDb()
    .prepare(
      `SELECT id, code, discount_type, discount_value, valid_from, valid_until,
              usage_cap, usage_count, scope_tour_id, is_active
         FROM promo_codes WHERE code = ?1`
    )
    .bind(code)
    .first<{
      id: string;
      code: string;
      discount_type: "percent" | "fixed";
      discount_value: number;
      valid_from: string | null;
      valid_until: string | null;
      usage_cap: number | null;
      usage_count: number;
      scope_tour_id: string | null;
      is_active: number;
    }>();

  if (!row) return { valid: false, reason: "not_found" };
  if (!row.is_active) return { valid: false, reason: "inactive" };
  if (row.valid_from && today < row.valid_from) return { valid: false, reason: "not_yet_valid" };
  if (row.valid_until && today > row.valid_until) return { valid: false, reason: "expired" };
  if (row.usage_cap != null && row.usage_count >= row.usage_cap) return { valid: false, reason: "usage_cap_reached" };
  if (row.scope_tour_id && row.scope_tour_id !== tourId) return { valid: false, reason: "wrong_tour" };

  return {
    valid: true,
    promo: { id: row.id, code: row.code, discountType: row.discount_type, discountValue: row.discount_value },
  };
}

function applyDiscount(subtotal: number, promo: PromoLookupResult["promo"]): number {
  if (!promo) return 0;
  const raw = promo.discountType === "percent" ? subtotal * (promo.discountValue / 100) : promo.discountValue;
  return Math.min(raw, subtotal); // never discount below zero
}

export interface TourPriceInput {
  tourId: string;
  date: string; // 'YYYY-MM-DD', the tour departure date -- for seasonal (rate_periods) lookup only
  bookingDate: string; // 'YYYY-MM-DD', today -- for promo-code validity window only
  adults: number;
  children: number;
  infants: number;
  pickupZoneId: string | null;
  promoCode: string | null;
}

export async function calculateTourPrice(input: TourPriceInput): Promise<PriceBreakdown> {
  // Negative counts would flow straight into the subtotal arithmetic below
  // and can produce a negative subtotal/total (money "owed" to the guest) --
  // fail loudly rather than silently mispricing. This is a pricing-invariant
  // guard (price is never negative), not form validation of the eventual
  // Server Action's input shape.
  if (input.adults < 0 || input.children < 0 || input.infants < 0) {
    throw new Error("adults/children/infants counts must not be negative");
  }

  const db = getDb();

  const { results: rates } = await db
    .prepare("SELECT id, min_age, price, counts_toward_capacity FROM tour_rates WHERE tour_id = ?1")
    .bind(input.tourId)
    .all<TourRateRow>();
  const { freeRate, paidRate } = pickAgeBandRates(rates);

  const period = await getActiveRatePeriod("tour", input.tourId, input.date);
  const adjustedPaidRate = applyRatePeriod(paidRate, period);
  const adjustedFreeRate = applyRatePeriod(freeRate, period);

  const subtotal = (input.adults + input.children) * adjustedPaidRate + input.infants * adjustedFreeRate;

  const transferFee = input.pickupZoneId
    ? ((await db.prepare("SELECT fee FROM pickup_zones WHERE id = ?1").bind(input.pickupZoneId).first<{ fee: number }>())
        ?.fee ?? 0)
    : 0;

  let discountAmount = 0;
  let promoApplied: PriceBreakdown["promoApplied"] = null;
  if (input.promoCode) {
    const lookup = await lookupPromoCode(input.promoCode, input.tourId, input.bookingDate);
    if (lookup.valid && lookup.promo) {
      discountAmount = applyDiscount(subtotal, lookup.promo);
      promoApplied = { code: lookup.promo.code, discountAmount };
    }
  }

  const total = subtotal - discountAmount + transferFee;
  return {
    subtotal,
    discountAmount,
    transferFee,
    total,
    promoApplied,
    ...splitPayment(total, await getPaymentPolicy()),
  };
}

export interface CampPriceInput {
  zoneId: string;
  stayType: string;
  checkIn: string; // 'YYYY-MM-DD'
  checkOut: string; // 'YYYY-MM-DD', exclusive
  bookingDate: string; // 'YYYY-MM-DD', today -- for promo-code validity window only
  promoCode: string | null;
}

const WEEKEND_DAYS = new Set([0, 6]); // Sunday, Saturday

/** Sums per-night camp pricing (weekday vs weekend rate) across [checkIn, checkOut). */
export async function calculateCampPrice(input: CampPriceInput): Promise<PriceBreakdown> {
  const db = getDb();

  const rate = await db
    .prepare("SELECT price_weekday, price_weekend FROM camp_rates WHERE zone_id = ?1 AND stay_type = ?2 AND is_active = 1")
    .bind(input.zoneId, input.stayType)
    .first<{ price_weekday: number; price_weekend: number }>();
  // Same reasoning as pickAgeBandRates()'s missing-paid-band guard: a
  // (zoneId, stayType) pair with no matching active camp_rates row (typo,
  // stale reference, deactivated rate) must not silently price as a free
  // stay -- that's indistinguishable from a legitimately free booking once
  // it reaches a guest or Stripe. Fail loudly instead.
  if (!rate) {
    throw new Error(`No active camp_rates row for zoneId="${input.zoneId}", stayType="${input.stayType}"`);
  }

  const period = await getActiveRatePeriod("camp_zone", input.zoneId, input.checkIn);
  const weekdayRate = applyRatePeriod(rate.price_weekday, period);
  const weekendRate = applyRatePeriod(rate.price_weekend, period);

  let subtotal = 0;
  const cursor = new Date(`${input.checkIn}T00:00:00Z`);
  const end = new Date(`${input.checkOut}T00:00:00Z`);
  // Guard against inputs the while-loop below would otherwise swallow
  // silently: a malformed (non-YYYY-MM-DD) date parses to Invalid Date, and
  // NaN comparisons are always false, so `cursor < end` would just never be
  // true -- same silent "0 nights, THB 0 total" outcome as checkOut on/before
  // checkIn. All three are real input-shape bugs (wrong field order, a typo),
  // not legitimate zero-cost stays, so they should fail loudly instead of
  // returning what looks like a valid free booking.
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Invalid checkIn/checkOut date: "${input.checkIn}" / "${input.checkOut}"`);
  }
  if (end <= cursor) {
    throw new Error(`checkOut (${input.checkOut}) must be after checkIn (${input.checkIn})`);
  }
  while (cursor < end) {
    subtotal += WEEKEND_DAYS.has(cursor.getUTCDay()) ? weekendRate : weekdayRate;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let discountAmount = 0;
  let promoApplied: PriceBreakdown["promoApplied"] = null;
  if (input.promoCode) {
    const lookup = await lookupPromoCode(input.promoCode, null, input.bookingDate);
    if (lookup.valid && lookup.promo) {
      discountAmount = applyDiscount(subtotal, lookup.promo);
      promoApplied = { code: lookup.promo.code, discountAmount };
    }
  }

  const total = subtotal - discountAmount;
  return {
    subtotal,
    discountAmount,
    transferFee: 0,
    total,
    promoApplied,
    ...splitPayment(total, await getPaymentPolicy()),
  };
}

/**
 * B2B payout, not a price adjustment -- agents.commission_percent has no
 * corresponding "agent rate" column on tour_rates/camp_rates, so an agent
 * booking is priced identically to a direct one; this is what the business
 * owes the agent afterward, tracked separately (bookings.booked_by_agent_id).
 */
export async function calculateAgentCommission(subtotal: number, agentId: string): Promise<number> {
  const agent = await getDb()
    .prepare("SELECT commission_percent FROM agents WHERE id = ?1 AND is_active = 1")
    .bind(agentId)
    .first<{ commission_percent: number }>();
  if (!agent) return 0;
  return subtotal * (agent.commission_percent / 100);
}
