import Link from "next/link";
import { listTours } from "@/lib/queries/tours";
import { listTourSessionsForAdmin } from "@/lib/scheduling";
import { GENERATE_WINDOW_DAYS } from "@/lib/session-generator";
import { setSessionBlocked, setSessionCapacity, generateNow } from "./actions";

function todayISO(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Same guard as the day sheet: a hand-edited ?from= must not 500 the page.
function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/**
 * The session calendar (plan §3: "Availability: session calendar (add/block
 * departures, adjust capacity), blocked-dates with reason").
 *
 * Shows the generated window a tour at a time. Departures come from
 * session_templates via lib/session-generator.ts; this screen is where staff
 * override the exceptions.
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ tourId?: string; from?: string; days?: string }>;
}) {
  const params = await searchParams;
  const tours = await listTours();
  const activeTours = tours.filter((t) => t.is_active === 1);

  const tourId = params.tourId && activeTours.some((t) => t.id === params.tourId)
    ? params.tourId
    : (activeTours[0]?.id ?? "");
  const from = params.from && isValidISODate(params.from) ? params.from : todayISO();
  const days = Number(params.days) > 0 ? Math.min(Number(params.days), GENERATE_WINDOW_DAYS) : 30;
  const to = addDaysISO(from, days);

  const sessions = tourId ? await listTourSessionsForAdmin(tourId, from, to) : [];
  const tourName = activeTours.find((t) => t.id === tourId)?.name ?? "";

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Availability</h1>
        <form action={generateNow}>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Generate departures
          </button>
        </form>
        <p>
          Departures are created automatically each morning from the weekly schedule, {GENERATE_WINDOW_DAYS} days
          ahead. Use this page to close a date or change how many seats one departure has.
        </p>
      </div>

      <form method="get" className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <div className="pr-dash-actions">
          <select name="tourId" defaultValue={tourId} style={{ width: "auto" }}>
            {activeTours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            From <input type="date" name="from" defaultValue={from} style={{ width: "auto" }} />
          </label>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            Days <input type="number" name="days" min={1} max={GENERATE_WINDOW_DAYS} defaultValue={days} style={{ width: "90px" }} />
          </label>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Show
          </button>
        </div>
      </form>

      {sessions.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">
            No departures for {tourName} between {from} and {to}.
            <br />
            If this is a new setup, press &quot;Generate departures&quot; above.
          </div>
        </div>
      ) : (
        <div className="pr-dash-tablewrap">
          <table className="pr-dash-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Booked</th>
                <th>Seats</th>
                <th>Status</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const sellable = s.capacity - s.allotment_hold;
                const full = s.booked_count >= sellable;
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{s.start_time}</td>
                    <td>
                      {s.booked_count} / {sellable}
                      {s.allotment_hold > 0 && (
                        <span className="pr-dash-field-hint"> ({s.allotment_hold} held for agents)</span>
                      )}
                    </td>
                    <td>
                      <form action={setSessionCapacity.bind(null, s.id)} className="pr-dash-actions">
                        {/* min = booked_count, not 0: the action refuses a
                            capacity below what's already booked (it would
                            silently mark the departure permanently oversold),
                            and refusing server-side means THROWING, whose
                            message Next.js redacts in production -- staff
                            would get an opaque "A server error occurred".
                            Blocking it in the browser turns an expected
                            mistake into an inline hint instead of a crash.
                            The server guard stays as the real boundary. */}
                        <input
                          type="number"
                          name="capacity"
                          min={s.booked_count}
                          title={s.booked_count > 0 ? `At least ${s.booked_count} -- that many guests are already booked.` : undefined}
                          defaultValue={s.capacity}
                          key={s.capacity}
                          style={{ width: "80px" }}
                        />
                        <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                          Set
                        </button>
                      </form>
                    </td>
                    <td>
                      {s.is_blocked ? (
                        <span className="pr-dash-badge pr-dash-badge-danger">Closed</span>
                      ) : full ? (
                        <span className="pr-dash-badge pr-dash-badge-warn">Full</span>
                      ) : (
                        <span className="pr-dash-badge pr-dash-badge-ok">Open</span>
                      )}
                    </td>
                    <td>{s.is_blocked ? (s.block_reason ?? "--") : ""}</td>
                    <td>
                      {s.is_blocked ? (
                        <form action={setSessionBlocked.bind(null, s.id, false)}>
                          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                            Reopen
                          </button>
                        </form>
                      ) : (
                        <form action={setSessionBlocked.bind(null, s.id, true)} className="pr-dash-actions">
                          <input name="block_reason" placeholder="Reason, e.g. river too high" style={{ width: "180px" }} />
                          <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">
                            Close
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="pr-dash-field-hint" style={{ marginTop: "16px" }}>
        The weekly schedule itself (which days and times run) lives in <code>session_templates</code> and isn&apos;t
        editable here yet -- <Link href="/dashboard/bookings/new">create a booking</Link> to test one, or ask a
        developer to change the schedule.
      </p>
    </div>
  );
}
