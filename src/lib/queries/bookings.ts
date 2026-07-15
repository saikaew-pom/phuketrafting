import { getDb } from "@/lib/db";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface BookingListRow {
  id: string;
  type: string;
  status: string;
  payment_status: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  total: number;
  currency: string;
  source: string;
  checked_in: number;
  created_at: number;
  date: string | null; // tour_sessions.date, or check_in for camp bookings
  product_name: string | null; // tours.name, or camp_zones.name
}

// Every booking column, 1:1 with migrations/0005_bookings.sql -- same
// convention as queries/tours.ts's Tour interface.
export interface Booking {
  id: string;
  type: string;
  tour_session_id: string | null;
  camp_unit_id: string | null;
  check_in: string | null;
  check_out: string | null;
  adults: number;
  children: number;
  infants: number;
  hotel: string | null;
  pickup_zone_id: string | null;
  transfer_fee: number;
  addon_choice: string | null;
  subtotal: number;
  discount_amount: number;
  total: number;
  currency: string;
  deposit_amount: number;
  balance_amount: number;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  locale: string;
  source: string;
  booked_by_agent_id: string | null;
  promo_code_id: string | null;
  status: string;
  checked_in: number;
  payment_status: string;
  stripe_checkout_session_id: string | null;
  manage_token: string | null;
  last_email_sent_at: number | null;
  last_email_status: string | null;
  last_whatsapp_sent_at: number | null;
  last_whatsapp_status: string | null;
  consent_marketing: number;
  waiver_acknowledged: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface BookingDetail extends Booking {
  date: string | null;
  product_name: string | null;
  pickup_zone_name: string | null;
}

export interface BookingLog {
  id: number;
  booking_id: string;
  actor: string;
  action: string;
  details: string | null;
  created_at: number;
}

// Both booking models joined into one list -- tour bookings via
// tour_session_id -> tour_sessions -> tours, camp bookings via
// camp_unit_id -> camp_units -> camp_zones. Exactly one side is ever
// non-null per row (bookings.type's CHECK constraint), so COALESCE picks
// whichever join actually matched.
const LIST_SELECT = `
  SELECT
    b.id, b.type, b.status, b.payment_status, b.guest_name, b.guest_email, b.guest_phone,
    b.total, b.currency, b.source, b.checked_in, b.created_at,
    COALESCE(ts.date, b.check_in) AS date,
    COALESCE(t.name, cz.name) AS product_name
  FROM bookings b
  LEFT JOIN tour_sessions ts ON b.tour_session_id = ts.id
  LEFT JOIN tours t ON ts.tour_id = t.id
  LEFT JOIN camp_units cu ON b.camp_unit_id = cu.id
  LEFT JOIN camp_zones cz ON cu.zone_id = cz.id`;

export async function listBookings(filters: { status?: string } = {}): Promise<BookingListRow[]> {
  const db = getDb();
  if (filters.status) {
    const { results } = await db
      .prepare(`${LIST_SELECT} WHERE b.status = ?1 ORDER BY b.created_at DESC`)
      .bind(filters.status)
      .all<BookingListRow>();
    return results;
  }
  const { results } = await db.prepare(`${LIST_SELECT} ORDER BY b.created_at DESC`).all<BookingListRow>();
  return results;
}

export async function getBookingDetail(id: string): Promise<BookingDetail | null> {
  const row = await getDb()
    .prepare(
      `SELECT
         b.*,
         COALESCE(ts.date, b.check_in) AS date,
         COALESCE(t.name, cz.name) AS product_name,
         pz.name AS pickup_zone_name
       FROM bookings b
       LEFT JOIN tour_sessions ts ON b.tour_session_id = ts.id
       LEFT JOIN tours t ON ts.tour_id = t.id
       LEFT JOIN camp_units cu ON b.camp_unit_id = cu.id
       LEFT JOIN camp_zones cz ON cu.zone_id = cz.id
       LEFT JOIN pickup_zones pz ON b.pickup_zone_id = pz.id
       WHERE b.id = ?1`
    )
    .bind(id)
    .first<BookingDetail>();
  return row ?? null;
}

// Same shape/joins as getBookingDetail, keyed by the guest self-service
// token instead of the internal id -- the public /[lang]/manage/[token]
// page uses this so a compromised/guessed manage_token can only ever surface
// exactly what the guest-facing page already renders (see that page's own
// comment on which BookingDetail fields it picks vs. omits).
export async function getBookingByManageToken(token: string): Promise<BookingDetail | null> {
  const row = await getDb()
    .prepare(
      `SELECT
         b.*,
         COALESCE(ts.date, b.check_in) AS date,
         COALESCE(t.name, cz.name) AS product_name,
         pz.name AS pickup_zone_name
       FROM bookings b
       LEFT JOIN tour_sessions ts ON b.tour_session_id = ts.id
       LEFT JOIN tours t ON ts.tour_id = t.id
       LEFT JOIN camp_units cu ON b.camp_unit_id = cu.id
       LEFT JOIN camp_zones cz ON cu.zone_id = cz.id
       LEFT JOIN pickup_zones pz ON b.pickup_zone_id = pz.id
       WHERE b.manage_token = ?1`
    )
    .bind(token)
    .first<BookingDetail>();
  return row ?? null;
}

export async function listBookingLogs(bookingId: string): Promise<BookingLog[]> {
  const { results } = await getDb()
    .prepare("SELECT id, booking_id, actor, action, details, created_at FROM booking_logs WHERE booking_id = ?1 ORDER BY created_at DESC")
    .bind(bookingId)
    .all<BookingLog>();
  return results;
}

// Each returns whether a row actually matched -- callers (actions.ts) use this
// to reject a nonexistent bookingId with a clear error BEFORE calling
// logBookingEvent, instead of letting a silent 0-row UPDATE fall through into
// booking_logs' FK constraint (booking_id REFERENCES bookings(id), no cascade)
// and surface as an opaque "FOREIGN KEY constraint failed" crash.
export async function updateBookingStatus(id: string, status: BookingStatus): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET status = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(status, id)
    .run();
  return result.meta.changes > 0;
}

export async function updateCheckedIn(id: string, checkedIn: boolean): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET checked_in = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(checkedIn ? 1 : 0, id)
    .run();
  return result.meta.changes > 0;
}

export async function updateBookingNotes(id: string, notes: string): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET notes = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(notes || null, id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Records which Stripe Checkout Session was created for a booking (plan §4:
 * "Checkout session id stored on the row"). This is the only link from a
 * Stripe payment back to a D1 row for staff reconciling by hand; the webhook
 * (5c) uses the session's own client_reference_id.
 */
export async function recordCheckoutSession(id: string, sessionId: string): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET stripe_checkout_session_id = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(sessionId, id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Records that Stripe collected the deposit.
 *
 * Deliberately touches payment_status ONLY -- `status` stays `pending`. Plan
 * §4 is explicit: "Booking is never confirmed by payment alone -- staff still
 * confirms (human-in-the-loop rule)." Paying is not the same as us having a
 * guide, a raft and a seat sorted for that guest.
 *
 * Guarded on awaiting_payment so a replayed/duplicate delivery can't walk a
 * refunded booking back to paid. Returns false if it didn't apply.
 */
export async function markBookingPaid(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE bookings SET payment_status = 'paid', updated_at = unixepoch()
        WHERE id = ?1 AND payment_status = 'awaiting_payment'`
    )
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/** Records a Stripe refund. Guarded so only a paid booking can become refunded. */
export async function markBookingRefunded(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE bookings SET payment_status = 'refunded', updated_at = unixepoch()
        WHERE id = ?1 AND payment_status = 'paid'`
    )
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

// Only these two columns decide "this booking is still holding inventory".
const UNPAID_GUARD = "status = 'pending' AND payment_status = 'awaiting_payment'";

/**
 * Releases a booking whose Checkout session expired without payment (plan §4:
 * "checkout.session.expired -> release").
 *
 * Cancels the booking AND frees the tour seat it was holding, as ONE
 * db.batch() -- i.e. one transaction. Doing it as two separate calls would
 * leave a real gap: a Worker eviction between them leaves the booking
 * cancelled while tour_sessions.booked_count still counts its seats, so that
 * capacity is lost forever with no booking to account for it. Exactly the
 * failure that made createTourBooking use a batch in the first place.
 *
 * ORDER MATTERS: the capacity release runs FIRST and reads the booking's
 * still-`pending` state through its own EXISTS guard. Reversing them would
 * break it -- statements in a batch see each other's writes, so once the
 * booking row is cancelled, the release's guard would evaluate false and the
 * seat would never come back. Both statements carry the same guard, so either
 * both apply or neither does.
 *
 * Camp bookings hold no counter (availability is derived from overlapping
 * active bookings, see scheduling.ts), so `tour_session_id IS NOT NULL` makes
 * the release a no-op for them -- cancelling the row IS the release.
 *
 * The `booked_count - pax >= 0` guard mirrors claimTourSessionCapacity's
 * `booked_count + delta >= 0` -- a negative counter is an invariant violation
 * there and must be one here too. It can only bite if the counter is ALREADY
 * inconsistent with the bookings that reference it, and in that case the
 * counter is deliberately left alone while the booking still cancels: an
 * under-counted session is a bug to investigate, but a NEGATIVE one actively
 * manufactures phantom capacity (availability reads `capacity - booked_count`),
 * which would let the session overbook. Refusing to make it worse is the
 * conservative half of the trade.
 */
export async function releaseUnpaidBooking(id: string, dbOverride?: D1Database): Promise<boolean> {
  // Optional db, defaulting to getDb(): the webhook calls this inside a fetch
  // (where getDb() works), the expiry sweeper calls it from scheduled() (where
  // getDb() throws -- no request context, see queries/notifications.ts). Same
  // optional-override shape as brevo.ts's BrevoConfig, so no existing caller
  // changes.
  const db = dbOverride ?? getDb();
  const [, cancelResult] = await db.batch([
    db
      .prepare(
        `UPDATE tour_sessions
            SET booked_count = booked_count - (SELECT b.adults + b.children FROM bookings b WHERE b.id = ?1),
                updated_at = unixepoch()
          WHERE id = (SELECT b.tour_session_id FROM bookings b WHERE b.id = ?1)
            AND EXISTS (
              SELECT 1 FROM bookings b
               WHERE b.id = ?1 AND b.tour_session_id IS NOT NULL AND ${UNPAID_GUARD}
            )
            AND booked_count - (SELECT b.adults + b.children FROM bookings b WHERE b.id = ?1) >= 0`
      )
      .bind(id),
    db
      .prepare(
        `UPDATE bookings SET status = 'cancelled', payment_status = 'failed', updated_at = unixepoch()
          WHERE id = ?1 AND ${UNPAID_GUARD}`
      )
      .bind(id),
  ]);
  return cancelResult.meta.changes > 0;
}

export async function recordEmailNotification(id: string, status: "sent" | "failed" | "not_configured"): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET last_email_sent_at = unixepoch(), last_email_status = ?1, updated_at = unixepoch() WHERE id = ?2")
    .bind(status, id)
    .run();
  return result.meta.changes > 0;
}

// "sent_manually" -- WhatsApp has no automated sender yet (Twilio is
// Phase 8), so this just records that a staff member clicked through and
// says they sent it, not a real delivery confirmation.
export async function recordWhatsAppNotification(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE bookings SET last_whatsapp_sent_at = unixepoch(), last_whatsapp_status = 'sent_manually', updated_at = unixepoch() WHERE id = ?1")
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

export interface DaySheetTourBooking {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  adults: number;
  children: number;
  infants: number;
  hotel: string | null;
  checked_in: number;
  // The BOOKER's own at-booking consent checkbox -- NOT whether every
  // participant has signed (that's signed_waivers below). Migration 0005's
  // own comment is explicit that these are different facts; the day-sheet
  // shows both because crew need to know both.
  waiver_acknowledged: number;
  signed_waivers: number;
  notes: string | null;
  pickup_zone_name: string | null;
}

export interface DaySheetSession {
  id: string;
  tour_name: string;
  start_time: string;
  capacity: number;
  booked_count: number;
  allotment_hold: number;
  bookings: DaySheetTourBooking[];
}

export interface DaySheetCampArrival {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  adults: number;
  children: number;
  infants: number;
  checked_in: number;
  notes: string | null;
  unit_name: string;
  zone_name: string;
  check_out: string;
}

export interface DaySheetCampDeparture {
  id: string;
  guest_name: string;
  unit_name: string;
  zone_name: string;
}

export interface DaySheet {
  date: string;
  sessions: DaySheetSession[];
  campArrivals: DaySheetCampArrival[];
  campDepartures: DaySheetCampDeparture[];
}

/**
 * Everything staff need for one operating day: tour sessions running that
 * day with their guest roster (pickup-zone sorted, per plan §2's "pickup
 * list sorted by zone/time"), plus camp guests arriving or departing that
 * day. Only `pending`/`confirmed` bookings show -- a cancelled or no-show
 * booking has no seat/unit reserved and shouldn't appear on the manifest
 * crew act on each morning.
 */
export async function getDaySheet(date: string): Promise<DaySheet> {
  const db = getDb();
  const activeIn = ACTIVE_STATUSES.map(() => "?").join(",");

  const [sessionRows, bookingRows, campArrivalRows, campDepartureRows] = await Promise.all([
    db
      .prepare(
        `SELECT ts.id, ts.start_time, ts.capacity, ts.booked_count, ts.allotment_hold, t.name AS tour_name
           FROM tour_sessions ts
           JOIN tours t ON ts.tour_id = t.id
          WHERE ts.date = ?1 AND ts.is_blocked = 0
          ORDER BY ts.start_time`
      )
      .bind(date)
      .all<Omit<DaySheetSession, "bookings">>(),
    db
      .prepare(
        // signed_waivers as a correlated subquery rather than a second round
        // trip per booking -- keeps this at the same fixed query count no
        // matter how large a session's roster gets, same anti-N+1 stance as
        // the group-in-JS Map below.
        `SELECT b.id, b.tour_session_id, b.guest_name, b.guest_phone, b.adults, b.children, b.infants,
                b.hotel, b.checked_in, b.waiver_acknowledged, b.notes, pz.name AS pickup_zone_name,
                (SELECT COUNT(*) FROM booking_participants bp
                  WHERE bp.booking_id = b.id AND bp.waiver_signed_at IS NOT NULL) AS signed_waivers
           FROM bookings b
           JOIN tour_sessions ts ON b.tour_session_id = ts.id
           LEFT JOIN pickup_zones pz ON b.pickup_zone_id = pz.id
          WHERE ts.date = ?1 AND b.status IN (${activeIn})
          ORDER BY pz.sort_order, b.guest_name`
      )
      .bind(date, ...ACTIVE_STATUSES)
      .all<DaySheetTourBooking & { tour_session_id: string }>(),
    db
      .prepare(
        `SELECT b.id, b.guest_name, b.guest_phone, b.adults, b.children, b.infants, b.checked_in, b.notes,
                cu.name AS unit_name, cz.name AS zone_name, b.check_out
           FROM bookings b
           JOIN camp_units cu ON b.camp_unit_id = cu.id
           JOIN camp_zones cz ON cu.zone_id = cz.id
          WHERE b.check_in = ?1 AND b.status IN (${activeIn})
          ORDER BY cz.sort_order, cu.name`
      )
      .bind(date, ...ACTIVE_STATUSES)
      .all<DaySheetCampArrival>(),
    db
      .prepare(
        `SELECT b.id, b.guest_name, cu.name AS unit_name, cz.name AS zone_name
           FROM bookings b
           JOIN camp_units cu ON b.camp_unit_id = cu.id
           JOIN camp_zones cz ON cu.zone_id = cz.id
          WHERE b.check_out = ?1 AND b.status IN (${activeIn})
          ORDER BY cz.sort_order, cu.name`
      )
      .bind(date, ...ACTIVE_STATUSES)
      .all<DaySheetCampDeparture>(),
  ]);

  const bookingsBySession = new Map<string, DaySheetTourBooking[]>();
  for (const { tour_session_id, ...booking } of bookingRows.results) {
    if (!bookingsBySession.has(tour_session_id)) bookingsBySession.set(tour_session_id, []);
    bookingsBySession.get(tour_session_id)!.push(booking);
  }

  return {
    date,
    sessions: sessionRows.results.map((s) => ({ ...s, bookings: bookingsBySession.get(s.id) ?? [] })),
    campArrivals: campArrivalRows.results,
    campDepartures: campDepartureRows.results,
  };
}

export interface ExpiredBookingRow {
  id: string;
  guest_name: string;
  created_at: number;
}

/**
 * Bookings whose payment window has run out and whose seat should come back
 * (plan §4: "Expiry sweeper (Cron Trigger, 15 min): awaiting_payment bookings
 * past expiry -> cancel + free capacity").
 *
 * The webhook already releases on checkout.session.expired, so this is the
 * BACKSTOP for the case where that delivery never lands (an outage, a bad
 * deploy, the destination misconfigured). Without it, one missed webhook
 * silently holds a seat forever.
 *
 * `stripe_checkout_session_id IS NOT NULL` is the load-bearing condition, and
 * it is NOT a stand-in for "unpaid". Read literally, plan §4 says to sweep any
 * `awaiting_payment` booking past expiry -- but under a pay_on_day policy
 * every booking is awaiting_payment forever by design (no deposit, no session,
 * nothing to collect until they arrive), so that rule would auto-cancel the
 * entire book of legitimate business the moment staff switched policy. Only a
 * booking that actually has a Stripe session pending is waiting on a payment
 * that can expire.
 *
 * It also (deliberately) spares a booking whose Checkout never opened at all
 * (checkout.ts's fail-open path, logged as checkout_open_failed): that guest
 * was never given a way to pay, so cancelling them for not paying would punish
 * them for our outage. Staff chase those from the activity log instead.
 */
export async function listExpiredUnpaidBookings(
  cutoffUnix: number,
  dbOverride?: D1Database
): Promise<ExpiredBookingRow[]> {
  // See releaseUnpaidBooking on why db is overridable.
  const { results } = await (dbOverride ?? getDb())
    .prepare(
      `SELECT id, guest_name, created_at
         FROM bookings
        WHERE ${UNPAID_GUARD}
          AND stripe_checkout_session_id IS NOT NULL
          AND created_at < ?1
        ORDER BY created_at`
    )
    .bind(cutoffUnix)
    .all<ExpiredBookingRow>();
  return results;
}
