import { getDb } from "@/lib/db";
import { claimCampUnitBooking } from "@/lib/scheduling";
import { calculateTourPrice, calculateCampPrice } from "@/lib/pricing";

export type BookingSource = "web" | "chatbot" | "whatsapp" | "staff" | "ota" | "agent";

export interface CreateBookingResult {
  success: boolean;
  bookingId?: string;
  // Guest self-service link secret (plan §2: "signed token in every email").
  // Always set alongside bookingId on success -- generated with the same
  // crypto.randomUUID() primitive already used for bookingId itself, just a
  // second, independent random value bound to bookings.manage_token.
  manageToken?: string;
  reason?: "not_found" | "no_capacity" | "blocked" | "invalid_input";
}

// Exported so admin actions (src/app/dashboard/bookings/actions.ts) can log
// staff-initiated events (status changes, check-in, notes) with the same
// append-only audit trail the public booking flows below already use --
// actor is the real requireStaff().email for those callers, not "system".
export async function logBookingEvent(bookingId: string, actor: string, action: string, details: unknown): Promise<void> {
  await getDb()
    .prepare("INSERT INTO booking_logs (booking_id, actor, action, details) VALUES (?1, ?2, ?3, ?4)")
    .bind(bookingId, actor, action, JSON.stringify(details))
    .run();
}

/**
 * Records a promo code redemption. Guarded (WHERE usage_count < usage_cap
 * OR usage_cap IS NULL) for the same reason scheduling.ts's capacity claims
 * are guarded -- D1 has no BEGIN/COMMIT, so a plain increment could race
 * past the cap under concurrency. Deliberately called AFTER the booking
 * already exists, and deliberately never fails the booking if the guarded
 * update affects 0 rows (a concurrent redemption won the cap race): the
 * guest was already quoted and charged the discounted price during
 * pricing, so honoring it is the right call, not retroactively taking it
 * back. Net effect: the cap can be exceeded by at most the concurrent
 * request count at the exact boundary, same class of trade-off as any
 * guarded-write system without transactions -- documented here rather than
 * silently accepted.
 */
async function recordPromoRedemption(code: string): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE promo_codes
          SET usage_count = usage_count + 1
        WHERE code = ?1
          AND (usage_cap IS NULL OR usage_count < usage_cap)`
    )
    .bind(code)
    .run();
}

/**
 * Resolves a promo code's row id so the booking can record which promo it
 * used (bookings.promo_code_id). pricing.ts's PriceBreakdown.promoApplied
 * only carries the code + discount amount, not the id, so this is a second
 * small lookup by the same UNIQUE-indexed `code` column -- not a re-validation
 * (the code's validity was already decided by calculateTourPrice/
 * calculateCampPrice; this just resolves its id). Returns null if the code
 * has somehow vanished between the price calculation and here -- should not
 * happen in practice (promo rows are never deleted, only deactivated), but
 * null is the correct value for an unresolvable code, not a thrown error,
 * since a bookkeeping lookup must never fail the booking itself.
 */
async function resolvePromoCodeId(code: string): Promise<string | null> {
  const row = await getDb().prepare("SELECT id FROM promo_codes WHERE code = ?1").bind(code).first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Runs a post-commit side effect (audit log write, promo redemption) without
 * letting its failure propagate. By the time these run, the booking row is
 * already committed -- a transient failure here (D1 hiccup, etc.) must not
 * turn a successful booking into an error response for the guest, who would
 * otherwise see "booking failed" for a booking that actually went through
 * (and was already priced/quoted). Logged via console.error so it's still
 * visible in `wrangler tail` / the dashboard, not silently dropped.
 */
async function runPostCommitEffect(bookingId: string, label: string, effect: () => Promise<void>): Promise<void> {
  try {
    await effect();
  } catch (err) {
    console.error(`booking ${bookingId}: post-commit effect "${label}" failed (booking already committed)`, err);
  }
}

export interface CreateTourBookingInput {
  tourSessionId: string;
  tourId: string;
  adults: number;
  children: number;
  infants: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  pickupZoneId: string | null;
  hotel: string | null;
  addonChoice: string | null;
  promoCode: string | null;
  locale: string;
  source: BookingSource;
  bookedByAgentId: string | null;
  consentMarketing: boolean;
  // Staff-only escape hatch (dashboard/bookings/new/actions.ts) -- drops the
  // capacity ceiling from the guard below while keeping the is_blocked check,
  // so a session staff have deliberately decided to overbook (an extra guest
  // request, a VIP, etc.) can still accept the booking instead of failing
  // with no_capacity. Never set from the public booking-actions.ts path --
  // there is no way for a guest-facing request to reach this.
  allowOverbook?: boolean;
}

export async function createTourBooking(input: CreateTourBookingInput): Promise<CreateBookingResult> {
  if (!input.guestName.trim()) return { success: false, reason: "invalid_input" };
  if (input.adults + input.children + input.infants <= 0) return { success: false, reason: "invalid_input" };

  const db = getDb();
  const session = await db
    .prepare("SELECT date, tour_id FROM tour_sessions WHERE id = ?1")
    .bind(input.tourSessionId)
    .first<{ date: string; tour_id: string }>();
  if (!session) return { success: false, reason: "not_found" };

  // input.tourId is client-supplied and, on its own, is just a claim -- the
  // session row (found via tourSessionId, the real trust anchor: an ID for
  // a specific date/capacity slot that already exists in D1) is the only
  // authoritative source of which tour this booking actually prices against.
  // Without this check, a client could name a real, open tourSessionId on an
  // expensive tour while passing a different (cheaper) tourId: the capacity
  // claim below still correctly consumes the real session's seat, but
  // calculateTourPrice would price the booking off the WRONG tour's
  // tour_rates -- a booking priced below cost that also consumes real
  // inventory it never paid for. Reject rather than silently correct, same
  // "fail loudly on a bad input, don't guess" stance as pricing.ts's own
  // missing-rate-band guards.
  if (session.tour_id !== input.tourId) return { success: false, reason: "invalid_input" };

  const today = new Date().toISOString().slice(0, 10);

  // Price BEFORE claiming capacity -- a bad tour/promo config should fail
  // fast without ever touching the session's booked_count. Pricing uses
  // session.tour_id (proven == input.tourId above, but this is the
  // authoritative value, not the client-supplied one) as the tourId of record.
  const price = await calculateTourPrice({
    tourId: session.tour_id,
    date: session.date,
    bookingDate: today,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    pickupZoneId: input.pickupZoneId,
    promoCode: input.promoCode,
  });

  // Resolve which promo_codes row (if any) this booking used, so it can be
  // recorded on the booking itself (bookings.promo_code_id) -- see
  // resolvePromoCodeId's doc comment. A pure read, so it belongs here,
  // before the capacity claim, same as the price calculation above.
  const promoCodeId = price.promoApplied ? await resolvePromoCodeId(price.promoApplied.code) : null;

  // Capacity counts adults+children only -- tour_rates.counts_toward_capacity=0
  // for the infant band is exactly this: infants ride along but don't
  // consume a seat.
  const paxDelta = input.adults + input.children;
  const bookingId = crypto.randomUUID();
  const manageToken = crypto.randomUUID();

  // The booking INSERT and the capacity UPDATE are sent as one db.batch()
  // call -- D1 runs a batch as a single transaction, and since D1/SQLite
  // serializes writers, no other write can interleave between these two
  // statements. Both are guarded by the SAME condition, and the INSERT runs
  // first, so the UPDATE's guard reads the identical pre-claim state the
  // INSERT's guard just read -- either both statements' guards pass
  // (booking created AND capacity claimed) or both fail as no-ops (nothing
  // written, nothing claimed). This replaces an earlier claim-then-insert
  // sequence that needed a manual compensating release if the insert failed
  // after the claim succeeded -- a real gap (flagged by code review) where a
  // Worker eviction between the two separate calls could leak claimed
  // capacity with no booking to account for it. A single db.batch() closes
  // that gap entirely: there is no gap between two RPCs to be evicted in the
  // middle of.
  //
  // allowOverbook drops the "booked_count + paxDelta <= capacity -
  // allotment_hold" half of the guard -- is_blocked is still enforced either
  // way (a session staff genuinely blocked, e.g. for maintenance, isn't
  // bookable even with an explicit override; that's a different kind of
  // "no" than "we're full").
  const guardClause = input.allowOverbook
    ? "is_blocked = 0"
    : "is_blocked = 0 AND booked_count + ? <= capacity - allotment_hold";
  const guardBindExtra = input.allowOverbook ? [] : [paxDelta];

  const insertStmt = db
    .prepare(
      `INSERT INTO bookings (
         id, type, tour_session_id, adults, children, infants, hotel,
         pickup_zone_id, transfer_fee, addon_choice, subtotal,
         discount_amount, total, guest_name, guest_email, guest_phone,
         locale, source, booked_by_agent_id, promo_code_id, consent_marketing,
         manage_token
       )
       SELECT ?,'tour',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE EXISTS (
          SELECT 1 FROM tour_sessions WHERE id = ? AND ${guardClause}
        )`
    )
    .bind(
      bookingId,
      input.tourSessionId,
      input.adults,
      input.children,
      input.infants,
      input.hotel,
      input.pickupZoneId,
      price.transferFee,
      input.addonChoice,
      price.subtotal,
      price.discountAmount,
      price.total,
      input.guestName.trim(),
      input.guestEmail,
      input.guestPhone,
      input.locale,
      input.source,
      input.bookedByAgentId,
      promoCodeId,
      input.consentMarketing ? 1 : 0,
      manageToken,
      input.tourSessionId,
      ...guardBindExtra
    );

  const updateStmt = db
    .prepare(
      `UPDATE tour_sessions
          SET booked_count = booked_count + ?, updated_at = unixepoch()
        WHERE id = ? AND ${guardClause}`
    )
    .bind(paxDelta, input.tourSessionId, ...guardBindExtra);

  const [insertResult, updateResult] = await db.batch([insertStmt, updateStmt]);

  if (insertResult.meta.changes === 0 || updateResult.meta.changes === 0) {
    // Zero rows on both sides (see above -- they always agree) -- work out
    // *why* for a better error message, same diagnostic-only read-after-write
    // pattern as scheduling.ts's claim functions.
    const current = await db
      .prepare("SELECT is_blocked FROM tour_sessions WHERE id = ?1")
      .bind(input.tourSessionId)
      .first<{ is_blocked: number }>();
    if (!current) return { success: false, reason: "not_found" };
    if (current.is_blocked) return { success: false, reason: "blocked" };
    return { success: false, reason: "no_capacity" };
  }

  await runPostCommitEffect(bookingId, "booking_logs", () =>
    logBookingEvent(bookingId, "system", "created", {
      source: input.source,
      total: price.total,
      ...(input.allowOverbook ? { overbooked: true } : {}),
    })
  );
  if (price.promoApplied) {
    await runPostCommitEffect(bookingId, "promo_redemption", () => recordPromoRedemption(price.promoApplied!.code));
  }

  return { success: true, bookingId, manageToken };
}

export interface CreateCampBookingInput {
  campUnitId: string;
  zoneId: string;
  stayType: string;
  checkIn: string;
  checkOut: string;
  // Camp pricing is flat per-unit-per-night (calculateCampPrice takes no
  // guest count), so these don't affect price -- they're the real headcount
  // for the manifest/staff planning, not priced line items the way tour
  // adults/children/infants are.
  adults: number;
  children: number;
  infants: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  promoCode: string | null;
  locale: string;
  source: BookingSource;
  bookedByAgentId: string | null;
  consentMarketing: boolean;
}

export async function createCampBooking(input: CreateCampBookingInput): Promise<CreateBookingResult> {
  if (!input.guestName.trim()) return { success: false, reason: "invalid_input" };
  // Same invariant as createTourBooking's guard above, and the same
  // reasoning as pricing.ts's own negative-count guard for tours: camp
  // headcounts aren't priced (calculateCampPrice takes no guest count at
  // all), but they ARE persisted and drive the manifest/staff planning.
  // Nothing else in this file or in pricing.ts validates them for the camp
  // path, so a negative or all-zero headcount would otherwise reach D1
  // unchecked.
  if (input.adults < 0 || input.children < 0 || input.infants < 0) {
    return { success: false, reason: "invalid_input" };
  }
  if (input.adults + input.children + input.infants <= 0) {
    return { success: false, reason: "invalid_input" };
  }

  // Same trust-boundary check as createTourBooking's session.tour_id guard
  // above, and the same underlying bug shape: campUnitId is the real trust
  // anchor (an ID for a specific, existing unit), and zoneId is only a
  // client-supplied claim about which zone -- and therefore which
  // camp_rates row -- to price against. Without this, a client could name a
  // real campUnitId in an expensive zone while passing a cheaper zoneId, and
  // calculateCampPrice below would price off the wrong zone's camp_rates
  // while claimCampUnitBooking still consumes the real unit's availability.
  const unit = await getDb()
    .prepare("SELECT zone_id FROM camp_units WHERE id = ?1")
    .bind(input.campUnitId)
    .first<{ zone_id: string }>();
  if (!unit) return { success: false, reason: "not_found" };
  if (unit.zone_id !== input.zoneId) return { success: false, reason: "invalid_input" };

  const today = new Date().toISOString().slice(0, 10);

  // Price BEFORE claiming -- calculateCampPrice throws on a bad
  // zone/stayType/date combination (pricing.ts's own guards), which we let
  // propagate rather than claiming a unit for a booking that can't be priced.
  // Uses unit.zone_id (proven == input.zoneId above, but authoritative) as
  // the zone of record, same reasoning as createTourBooking's session.tour_id.
  const price = await calculateCampPrice({
    zoneId: unit.zone_id,
    stayType: input.stayType,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    bookingDate: today,
    promoCode: input.promoCode,
  });

  // See createTourBooking's identical step -- pure read, belongs before the
  // claim.
  const promoCodeId = price.promoApplied ? await resolvePromoCodeId(price.promoApplied.code) : null;

  const bookingId = crypto.randomUUID();
  const manageToken = crypto.randomUUID();
  // claimCampUnitBooking's guarded INSERT ... SELECT ... WHERE does the
  // availability check and the row insert as one atomic statement (see
  // scheduling.ts) -- no separate claim-then-insert, so no compensation
  // step is needed here the way the tour path needs one.
  const claim = await claimCampUnitBooking({
    bookingId,
    manageToken,
    campUnitId: input.campUnitId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    bookingColumns: {
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      subtotal: price.subtotal,
      discount_amount: price.discountAmount,
      total: price.total,
      guest_name: input.guestName.trim(),
      guest_email: input.guestEmail,
      guest_phone: input.guestPhone,
      locale: input.locale,
      source: input.source,
      booked_by_agent_id: input.bookedByAgentId,
      promo_code_id: promoCodeId,
      consent_marketing: input.consentMarketing ? 1 : 0,
    },
  });
  if (!claim.success) return { success: false, reason: claim.reason };

  await runPostCommitEffect(bookingId, "booking_logs", () =>
    logBookingEvent(bookingId, "system", "created", { source: input.source, total: price.total })
  );
  if (price.promoApplied) {
    await runPostCommitEffect(bookingId, "promo_redemption", () => recordPromoRedemption(price.promoApplied!.code));
  }

  return { success: true, bookingId, manageToken };
}
