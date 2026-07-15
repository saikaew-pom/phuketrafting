/**
 * Queries backing the daily pre-arrival (T-1) / thank-you (T+1) crons, plan
 * §2. See migrations/0013_scheduled_notifications.sql for why these get their
 * own columns rather than reusing last_email_sent_at/last_email_status.
 *
 * Every function here takes `db` explicitly instead of calling lib/db.ts's
 * getDb(), which every other queries/* module uses. That is not gratuitous
 * inconsistency: getDb() resolves the D1 binding from getCloudflareContext(),
 * which reads an AsyncLocalStorage store that OpenNext only populates inside
 * runWithCloudflareRequestContext() -- i.e. only during a fetch. These run
 * from custom-worker.ts's scheduled() handler, where there is no request and
 * no store, so getDb() throws there (verified by reading
 * @opennextjs/cloudflare's init.js/cloudflare-context.js). The scheduled()
 * handler is handed `env` directly by the runtime, so the binding is passed
 * down from there.
 */

export type NotificationKind = "pre_arrival" | "thank_you";

export interface DueBooking {
  id: string;
  guest_name: string;
  guest_email: string;
  locale: string;
  manage_token: string | null;
  product_name: string | null;
  date: string | null;
  start_time: string | null;
  pickup_zone_name: string | null;
  pickup_earliest_time: string | null;
  hotel: string | null;
}

// The two crons do NOT share a status filter, and conflating them silently
// drops real guests.
//
// T-1 fires the morning BEFORE the trip, when the booking can only legitimately
// be pending/confirmed -- `completed` at that point is a past-tense state a
// reminder has no business firing on (matches ACTIVE_STATUSES in
// queries/bookings.ts, the day-sheet's "who is actually coming" filter).
//
// T+1 fires the morning AFTER the trip, by which time staff have very often
// already moved the booking to `completed` -- that is precisely what the status
// is for, and it's offered in the dashboard status dropdown
// (dashboard/bookings/actions.ts VALID_STATUSES). Reusing the T-1 filter here
// meant every properly-closed-out booking was excluded from its own thank-you:
// the better the staff were at their job, the fewer guests got thanked.
// Verified against local D1: a `completed` booking whose trip ended on the
// target date was returned 0 times by the old filter.
//
// cancelled/no_show stay excluded from both: nobody thanks a guest for a trip
// they cancelled or didn't turn up to.
const PRE_ARRIVAL_STATUSES = ["pending", "confirmed"] as const;
const THANK_YOU_STATUSES = ["pending", "confirmed", "completed"] as const;

/**
 * Column/join shape shared by both queries -- they need the same guest,
 * product and pickup fields and differ only in which date expression drives
 * them, which claim column must still be NULL, and which statuses qualify.
 *
 * `dateExpr` is interpolated, so it must never come from user input: the only
 * two call sites pass the module-level constants below. It is a parameter
 * rather than a hardcoded expression because the SELECT's `date` and the
 * WHERE's filter MUST be the same expression -- when they drifted apart, the
 * thank-you query filtered camp bookings on check_out but reported check_in
 * as the trip date.
 */
function dueSelect(dateExpr: string): string {
  return `
  SELECT
    b.id, b.guest_name, b.guest_email, b.locale, b.manage_token, b.hotel,
    COALESCE(t.name, cz.name) AS product_name,
    ${dateExpr} AS date,
    ts.start_time,
    pz.name AS pickup_zone_name,
    pz.earliest_pickup_time AS pickup_earliest_time
  FROM bookings b
  LEFT JOIN tour_sessions ts ON b.tour_session_id = ts.id
  LEFT JOIN tours t ON ts.tour_id = t.id
  LEFT JOIN camp_units cu ON b.camp_unit_id = cu.id
  LEFT JOIN camp_zones cz ON cu.zone_id = cz.id
  LEFT JOIN pickup_zones pz ON b.pickup_zone_id = pz.id`;
}

// A trip STARTS on the tour session's date, or on a camp booking's check_in.
const PRE_ARRIVAL_DATE_EXPR = "COALESCE(ts.date, b.check_in)";
// A trip ENDS on the tour session's date, or on a camp booking's check_OUT --
// a camper who checked in on the 1st for 3 nights is thanked when they leave
// on the 4th, not on the 2nd.
const THANK_YOU_DATE_EXPR = "COALESCE(ts.date, b.check_out)";

/**
 * Bookings whose trip starts on `date` (a tour session that day, or a camp
 * check-in that day) and that haven't had a pre-arrival mail claimed yet.
 *
 * guest_email IS NOT NULL: a phone-only booking (staff-created walk-ins can
 * have no email) has nothing to send to, and claiming it would permanently
 * mark it "sent" for a mail that never existed.
 */
export async function listPreArrivalDue(db: D1Database, date: string): Promise<DueBooking[]> {
  const { results } = await db
    .prepare(
      `${dueSelect(PRE_ARRIVAL_DATE_EXPR)}
        WHERE ${PRE_ARRIVAL_DATE_EXPR} = ?1
          AND b.status IN (${PRE_ARRIVAL_STATUSES.map(() => "?").join(",")})
          AND b.guest_email IS NOT NULL
          AND b.pre_arrival_sent_at IS NULL`
    )
    .bind(date, ...PRE_ARRIVAL_STATUSES)
    .all<DueBooking>();
  return results;
}

/**
 * Bookings whose trip ENDED on `date` (see THANK_YOU_DATE_EXPR) and that
 * haven't had a thank-you mail claimed yet.
 *
 * Includes `completed`, unlike listPreArrivalDue -- see THANK_YOU_STATUSES.
 */
export async function listThankYouDue(db: D1Database, date: string): Promise<DueBooking[]> {
  const { results } = await db
    .prepare(
      `${dueSelect(THANK_YOU_DATE_EXPR)}
        WHERE ${THANK_YOU_DATE_EXPR} = ?1
          AND b.status IN (${THANK_YOU_STATUSES.map(() => "?").join(",")})
          AND b.guest_email IS NOT NULL
          AND b.thank_you_sent_at IS NULL`
    )
    .bind(date, ...THANK_YOU_STATUSES)
    .all<DueBooking>();
  return results;
}

/**
 * Atomically claims the right to send `kind` for this booking. Returns false
 * if someone else already claimed it (a concurrent or retried cron
 * invocation), in which case the caller must NOT send.
 *
 * The IS NULL check is folded into the UPDATE rather than done as a separate
 * read, for exactly the reason scheduling.ts's capacity claims are: D1 has no
 * BEGIN/COMMIT, so a read-then-write leaves a gap where two invocations both
 * see NULL and both send. Cloudflare can and does retry/overlap scheduled
 * invocations, so this is a real scenario, not a theoretical one.
 */
export async function claimNotification(db: D1Database, bookingId: string, kind: NotificationKind): Promise<boolean> {
  // Column names are interpolated, so they must never come from user input --
  // NotificationKind is a closed union, and this map is the only way to reach
  // a column name. Same allowlist stance as scheduling.ts's
  // ALLOWED_CAMP_BOOKING_COLUMNS.
  const column = kind === "pre_arrival" ? "pre_arrival_sent_at" : "thank_you_sent_at";
  const result = await db
    .prepare(`UPDATE bookings SET ${column} = unixepoch() WHERE id = ?1 AND ${column} IS NULL`)
    .bind(bookingId)
    .run();
  return result.meta.changes > 0;
}

/** Records the outcome of a claimed send. The claim timestamp is left alone. */
export async function recordNotificationStatus(
  db: D1Database,
  bookingId: string,
  kind: NotificationKind,
  status: "sent" | "failed" | "not_configured"
): Promise<void> {
  const column = kind === "pre_arrival" ? "pre_arrival_status" : "thank_you_status";
  await db
    .prepare(`UPDATE bookings SET ${column} = ?1, updated_at = unixepoch() WHERE id = ?2`)
    .bind(status, bookingId)
    .run();
}
