import { getDb } from "@/lib/db";
import { claimTourSessionCapacity, claimCampUnitBooking } from "@/lib/scheduling";
import { calculateTourPrice, calculateCampPrice } from "@/lib/pricing";

export type BookingSource = "web" | "chatbot" | "whatsapp" | "staff" | "ota" | "agent";

export interface CreateBookingResult {
  success: boolean;
  bookingId?: string;
  reason?: "not_found" | "no_capacity" | "blocked" | "invalid_input";
}

async function logBookingEvent(bookingId: string, actor: string, action: string, details: unknown): Promise<void> {
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
}

export async function createTourBooking(input: CreateTourBookingInput): Promise<CreateBookingResult> {
  if (!input.guestName.trim()) return { success: false, reason: "invalid_input" };
  if (input.adults + input.children + input.infants <= 0) return { success: false, reason: "invalid_input" };

  const db = getDb();
  const session = await db
    .prepare("SELECT date FROM tour_sessions WHERE id = ?1")
    .bind(input.tourSessionId)
    .first<{ date: string }>();
  if (!session) return { success: false, reason: "not_found" };

  const today = new Date().toISOString().slice(0, 10);

  // Price BEFORE claiming capacity -- a bad tour/promo config should fail
  // fast without ever touching the session's booked_count.
  const price = await calculateTourPrice({
    tourId: input.tourId,
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
  const claim = await claimTourSessionCapacity(input.tourSessionId, input.adults + input.children);
  if (!claim.success) return { success: false, reason: claim.reason };

  const bookingId = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO bookings (
           id, type, tour_session_id, adults, children, infants, hotel,
           pickup_zone_id, transfer_fee, addon_choice, subtotal,
           discount_amount, total, guest_name, guest_email, guest_phone,
           locale, source, booked_by_agent_id, promo_code_id, consent_marketing
         ) VALUES (?1,'tour',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
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
        input.consentMarketing ? 1 : 0
      )
      .run();
  } catch (err) {
    // Compensate: the capacity claim above succeeded but the booking row
    // itself failed to write (constraint violation, transient D1 error) --
    // without this, the session would show seats taken with no booking to
    // account for them. D1 has no transactions to roll this back for us.
    // The release is wrapped separately: if IT also throws (e.g. D1 is
    // unreachable entirely), that must not mask the original insert
    // failure -- log the compensation failure and still throw the
    // original `err`, not whatever the release call threw.
    try {
      await claimTourSessionCapacity(input.tourSessionId, -(input.adults + input.children));
    } catch (releaseErr) {
      console.error(
        `createTourBooking: capacity release failed after insert failure for session ${input.tourSessionId} -- ` +
          `${input.adults + input.children} seat(s) may be leaked`,
        releaseErr
      );
    }
    throw err;
  }

  await runPostCommitEffect(bookingId, "booking_logs", () =>
    logBookingEvent(bookingId, "system", "created", { source: input.source, total: price.total })
  );
  if (price.promoApplied) {
    await runPostCommitEffect(bookingId, "promo_redemption", () => recordPromoRedemption(price.promoApplied!.code));
  }

  return { success: true, bookingId };
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

  const today = new Date().toISOString().slice(0, 10);

  // Price BEFORE claiming -- calculateCampPrice throws on a bad
  // zone/stayType/date combination (pricing.ts's own guards), which we let
  // propagate rather than claiming a unit for a booking that can't be priced.
  const price = await calculateCampPrice({
    zoneId: input.zoneId,
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
  // claimCampUnitBooking's guarded INSERT ... SELECT ... WHERE does the
  // availability check and the row insert as one atomic statement (see
  // scheduling.ts) -- no separate claim-then-insert, so no compensation
  // step is needed here the way the tour path needs one.
  const claim = await claimCampUnitBooking({
    bookingId,
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

  return { success: true, bookingId };
}
