import { getDb } from "@/lib/db";

/**
 * Capacity-safe primitives for the two booking models (plan §2), both
 * documented in their originating migrations:
 *
 * - Tour sessions (migrations/0002_tours_and_sessions.sql): a maintained
 *   `booked_count` counter, claimed/released via ONE guarded UPDATE. D1 has
 *   no BEGIN/COMMIT, so a separate check-then-write would race; the WHERE
 *   clause folds the check into the write itself. Proven under real
 *   concurrency in Phase 1 (10 concurrent claims against capacity 5 -> exactly
 *   5 succeeded).
 * - Camp units (migrations/0003_camping.sql / 0005_bookings.sql): no counter
 *   -- availability is "unit not blocked AND no overlapping pending/confirmed
 *   booking for this unit", checked via a guarded INSERT ... SELECT ... WHERE
 *   EXISTS (not blocked) AND NOT EXISTS (no overlap). Both conditions live in
 *   that one statement -- same reasoning as tour sessions above: a separate
 *   is_blocked pre-read followed by the insert would leave a gap where a
 *   concurrent block (e.g. staff pulling a unit for maintenance) between the
 *   read and the write goes unseen by the write.
 *
 * Both return a typed reason on failure so callers can show the guest a
 * specific message instead of a generic "something went wrong".
 */

export type CapacityFailureReason = "not_found" | "no_capacity" | "blocked";

export interface CapacityResult {
  success: boolean;
  reason?: CapacityFailureReason;
}

/**
 * Claims (delta > 0) or releases (delta < 0) seats on a tour session.
 * Safe to call concurrently -- see module comment. `delta` of 0 is a no-op
 * that still reports whether the session exists/has room, useful for a
 * pure availability check without mutating anything.
 */
export async function claimTourSessionCapacity(sessionId: string, delta: number): Promise<CapacityResult> {
  const db = getDb();

  if (delta === 0) {
    const session = await db
      .prepare("SELECT capacity, booked_count, allotment_hold, is_blocked FROM tour_sessions WHERE id = ?1")
      .bind(sessionId)
      .first<{ capacity: number; booked_count: number; allotment_hold: number; is_blocked: number }>();
    if (!session) return { success: false, reason: "not_found" };
    if (session.is_blocked) return { success: false, reason: "blocked" };
    if (session.booked_count >= session.capacity - session.allotment_hold) {
      return { success: false, reason: "no_capacity" };
    }
    return { success: true };
  }

  const result = await db
    .prepare(
      `UPDATE tour_sessions
          SET booked_count = booked_count + ?1, updated_at = unixepoch()
        WHERE id = ?2
          AND is_blocked = 0
          AND booked_count + ?1 >= 0
          AND booked_count + ?1 <= capacity - allotment_hold`
    )
    .bind(delta, sessionId)
    .run();

  if (result.meta.changes > 0) return { success: true };

  // Zero rows changed -- work out *why* for a better error message. The
  // session's current state may have moved since the UPDATE ran, but this
  // read-after-write is diagnostic only (not used to decide anything).
  const session = await db
    .prepare("SELECT is_blocked FROM tour_sessions WHERE id = ?1")
    .bind(sessionId)
    .first<{ is_blocked: number }>();
  if (!session) return { success: false, reason: "not_found" };
  if (session.is_blocked) return { success: false, reason: "blocked" };
  return { success: false, reason: "no_capacity" };
}

export interface AvailableTourSession {
  id: string;
  date: string;
  start_time: string;
  capacity: number;
  booked_count: number;
  allotment_hold: number;
}

/** Tour sessions with at least one open seat, in a date range, for one tour. */
export async function listAvailableTourSessions(
  tourId: string,
  fromDate: string,
  toDate: string
): Promise<AvailableTourSession[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, date, start_time, capacity, booked_count, allotment_hold
         FROM tour_sessions
        WHERE tour_id = ?1
          AND date >= ?2 AND date <= ?3
          AND is_blocked = 0
          AND booked_count < capacity - allotment_hold
        ORDER BY date, start_time`
    )
    .bind(tourId, fromDate, toDate)
    .all<AvailableTourSession>();
  return results;
}

export interface AdminTourSession extends AvailableTourSession {
  is_blocked: number;
  /** Why staff closed this departure -- shown on the availability calendar. */
  block_reason: string | null;
}

/**
 * Every tour session in a date range, regardless of remaining capacity --
 * unlike listAvailableTourSessions (which the public widget uses and which
 * deliberately hides full sessions), staff creating a booking manually need
 * to SEE a full session to decide whether to overbook it. is_blocked
 * sessions are included too (not booked_count-filtered) so staff aren't
 * confused by a session silently missing from the list; the create-booking
 * action still refuses a blocked session outright, overbook or not.
 */
export async function listTourSessionsForAdmin(
  tourId: string,
  fromDate: string,
  toDate: string
): Promise<AdminTourSession[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, date, start_time, capacity, booked_count, allotment_hold, is_blocked, block_reason
         FROM tour_sessions
        WHERE tour_id = ?1
          AND date >= ?2 AND date <= ?3
        ORDER BY date, start_time`
    )
    .bind(tourId, fromDate, toDate)
    .all<AdminTourSession>();
  return results;
}

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"] as const;

// bookingColumns' keys become raw SQL column names (see the query below) --
// an allowlist closes the injection surface flagged when this function had
// no real caller yet. Every guest/booking-detail column a NEW camp booking
// can legitimately set at creation time; deliberately excludes system-
// managed columns (status/checked_in/payment_status/stripe_*/manage_token/
// last_*_sent_at/last_*_status/created_at/updated_at) and tour_session_id
// (not applicable to camp bookings -- that's the tour-booking path).
const ALLOWED_CAMP_BOOKING_COLUMNS = new Set([
  "adults",
  "children",
  "infants",
  "hotel",
  "pickup_zone_id",
  "transfer_fee",
  "addon_choice",
  "subtotal",
  "discount_amount",
  "total",
  "currency",
  "deposit_amount",
  "balance_amount",
  "guest_name",
  "guest_email",
  "guest_phone",
  "locale",
  "source",
  "booked_by_agent_id",
  "promo_code_id",
  "consent_marketing",
  "waiver_acknowledged",
  "notes",
]);

/**
 * Atomically inserts a camp booking iff the unit is not blocked AND no
 * active (pending/confirmed) booking on the same unit overlaps [checkIn,
 * checkOut). Half-open range -- a checkout on day N and a new check-in on
 * day N do not overlap. Returns the failure reason without inserting
 * anything if the unit is unavailable.
 */
export async function claimCampUnitBooking(params: {
  bookingId: string;
  // Guest self-service link secret (plan §2) -- a fixed, always-set column
  // at creation time, same tier as bookingId/type/camp_unit_id below, not a
  // caller-supplied "booking column" from the allowlist (manage_token is
  // explicitly excluded from ALLOWED_CAMP_BOOKING_COLUMNS as system-managed).
  manageToken: string;
  campUnitId: string;
  checkIn: string;
  checkOut: string;
  bookingColumns: Record<string, string | number | null>;
}): Promise<CapacityResult> {
  const db = getDb();

  for (const key of Object.keys(params.bookingColumns)) {
    if (!ALLOWED_CAMP_BOOKING_COLUMNS.has(key)) {
      throw new Error(`claimCampUnitBooking: "${key}" is not an allowed bookingColumns key`);
    }
  }

  const columns = [
    "id",
    "type",
    "camp_unit_id",
    "check_in",
    "check_out",
    "manage_token",
    ...Object.keys(params.bookingColumns),
  ];
  const insertValues = [
    params.bookingId,
    "camp",
    params.campUnitId,
    params.checkIn,
    params.checkOut,
    params.manageToken,
    ...Object.values(params.bookingColumns),
  ];

  // Unnumbered "?" placeholders throughout, bound as one flat array in the
  // exact order they appear below -- with three separate value lists
  // (insert columns, then the is_blocked check's own param, then the
  // overlap-check's own params) feeding one dynamically-sized query,
  // numbered placeholders (?1, ?2, ...) would need hand-computed offsets
  // that are easy to get subtly wrong; positional "?" sidesteps that
  // entirely.
  const bindValues = [
    ...insertValues,
    params.campUnitId,
    params.campUnitId,
    ...ACTIVE_BOOKING_STATUSES,
    params.checkOut,
    params.checkIn,
  ];

  // Both the is_blocked check AND the overlap check are folded into this ONE
  // guarded INSERT ... SELECT ... WHERE, same as claimTourSessionCapacity's
  // guarded UPDATE -- a separate pre-read of is_blocked (checked, then a
  // later separate write) would reopen exactly the race this module exists
  // to avoid: the unit could be blocked by a concurrent staff action in the
  // gap between the read and the write, and the write wouldn't see it.
  const result = await db
    .prepare(
      `INSERT INTO bookings (${columns.join(", ")})
       SELECT ${columns.map(() => "?").join(", ")}
        WHERE EXISTS (
          -- is_active AND is_blocked, matching listAvailableCampUnits exactly.
          -- The guarded INSERT exists to close the gap between "the guest saw
          -- this unit in the list" and "the guest submitted", and it closed that
          -- gap for is_blocked while missing is_active -- so a unit retired
          -- mid-session (unticking Active is the documented way to retire a
          -- tent, see queries/camping.ts) vanished from the list but could still
          -- be claimed from an already-open tab or a direct POST. The guest was
          -- charged and would arrive to a tent that no longer exists.
          SELECT 1 FROM camp_units u WHERE u.id = ? AND u.is_active = 1 AND u.is_blocked = 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
           WHERE b.camp_unit_id = ?
             AND b.status IN (${ACTIVE_BOOKING_STATUSES.map(() => "?").join(",")})
             AND b.check_in < ?
             AND b.check_out > ?
        )`
    )
    .bind(...bindValues)
    .run();

  if (result.meta.changes > 0) return { success: true };

  // Zero rows -- work out *why* for a better error message, same pattern as
  // claimTourSessionCapacity: this read-after-write is diagnostic only (not
  // used to decide anything -- `success` above was already decided by the
  // one atomic guarded statement).
  // Reads is_active as well as is_blocked, so it can explain every rejection the
  // guarded INSERT above can now produce. Without the is_active arm a RETIRED
  // unit fell through to "no_capacity", which camp-booking-actions.ts renders as
  // "that campsite just got booked" -- a specific claim about another guest that
  // is simply untrue for a tent the operator withdrew. A retired unit is the
  // same fact as a missing one from the guest's side, so it reports not_found
  // ("no longer available"); CapacityFailureReason needs no new member.
  const unit = await db
    .prepare("SELECT is_active, is_blocked FROM camp_units WHERE id = ?1")
    .bind(params.campUnitId)
    .first<{ is_active: number; is_blocked: number }>();
  if (!unit || !unit.is_active) return { success: false, reason: "not_found" };
  if (unit.is_blocked) return { success: false, reason: "blocked" };
  return { success: false, reason: "no_capacity" };
}

export interface AvailableCampUnit {
  id: string;
  name: string;
  occupancy: number;
}

/**
 * Camp units in one zone with no active (pending/confirmed) booking
 * overlapping [checkIn, checkOut) -- feeds the camp booking widget's unit
 * picker, same half-open-range overlap check as claimCampUnitBooking. This
 * is a read used to populate a list, not a claim -- the actual booking still
 * goes through claimCampUnitBooking's atomic guarded INSERT, so a unit shown
 * here as available can still lose a race to a concurrent booking; the
 * caller surfaces that via claimCampUnitBooking's own "no_capacity" reason.
 */
export async function listAvailableCampUnits(
  zoneId: string,
  checkIn: string,
  checkOut: string
): Promise<AvailableCampUnit[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, name, occupancy FROM camp_units u
        WHERE u.zone_id = ?
          AND u.is_active = 1
          AND u.is_blocked = 0
          AND NOT EXISTS (
            SELECT 1 FROM bookings b
             WHERE b.camp_unit_id = u.id
               AND b.status IN (${ACTIVE_BOOKING_STATUSES.map(() => "?").join(",")})
               AND b.check_in < ?
               AND b.check_out > ?
          )
        ORDER BY u.occupancy, u.name`
    )
    .bind(zoneId, ...ACTIVE_BOOKING_STATUSES, checkOut, checkIn)
    .all<AvailableCampUnit>();
  return results;
}

export interface CampStay {
  booking_id: string;
  camp_unit_id: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_name: string | null;
}

/**
 * Every active stay touching [fromDate, toDate) across a zone's units -- the
 * data behind the camp availability calendar.
 *
 * Overlap, not containment: a stay that started before the window and ends
 * inside it still occupies its nights, so filtering on `check_in >= fromDate`
 * would render those nights free and invite a double-booking that
 * claimCampUnitBooking would then (correctly) refuse -- staff would see a
 * calendar that disagrees with the booking form. Same half-open comparison as
 * every other camp availability check here.
 *
 * A read for display only. The guarded INSERT remains the boundary.
 */
export async function listCampStaysForAdmin(
  zoneId: string,
  fromDate: string,
  toDate: string
): Promise<CampStay[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT b.id AS booking_id, b.camp_unit_id, b.check_in, b.check_out, b.status, b.guest_name
         FROM bookings b
         JOIN camp_units u ON u.id = b.camp_unit_id
        WHERE u.zone_id = ?
          AND b.status IN (${ACTIVE_BOOKING_STATUSES.map(() => "?").join(",")})
          AND b.check_in < ?
          AND b.check_out > ?
        ORDER BY b.check_in`
    )
    .bind(zoneId, ...ACTIVE_BOOKING_STATUSES, toDate, fromDate)
    .all<CampStay>();
  return results;
}

export interface CampAvailabilityWindow {
  campUnitId: string;
  checkIn: string;
  checkOut: string;
}

/** True if the unit has no active booking overlapping [checkIn, checkOut). */
export async function isCampUnitAvailable({ campUnitId, checkIn, checkOut }: CampAvailabilityWindow): Promise<boolean> {
  const db = getDb();
  const unit = await db
    .prepare("SELECT is_blocked FROM camp_units WHERE id = ?1")
    .bind(campUnitId)
    .first<{ is_blocked: number }>();
  if (!unit || unit.is_blocked) return false;

  const overlap = await db
    .prepare(
      `SELECT 1 FROM bookings
        WHERE camp_unit_id = ?
          AND status IN (${ACTIVE_BOOKING_STATUSES.map(() => "?").join(",")})
          AND check_in < ?
          AND check_out > ?
        LIMIT 1`
    )
    .bind(campUnitId, ...ACTIVE_BOOKING_STATUSES, checkOut, checkIn)
    .first();
  return !overlap;
}
