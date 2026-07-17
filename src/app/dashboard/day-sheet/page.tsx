import Link from "next/link";
import { getDaySheet } from "@/lib/queries/bookings";
import { bangkokTodayISO } from "@/lib/format";
import { toggleCheckedIn } from "../bookings/actions";

// Asia/Bangkok, not UTC: with a bare toISOString() the default "today" and the
// "Today" button showed YESTERDAY's manifest between 00:00 and 07:00 Thailand
// time -- exactly the pre-dawn hours crew prep the morning pickups. (Audit A7.)
function todayISO(): string {
  return bangkokTodayISO();
}
function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A malformed or out-of-range ?date= (typo'd URL, stale bookmark, hand-edited
// query string -- this is a staff-facing tool, not a form with client-side
// validation) makes `new Date(...)` produce an Invalid Date. addDaysISO's
// toISOString() then throws "RangeError: Invalid time value", crashing the
// whole page with a 500 before any D1 query even runs. Confirmed live:
// /dashboard/day-sheet?date=not-a-date 500'd. Falling back to today for
// anything that doesn't parse to a real calendar date is friendlier than a
// crash and matches how a bad date elsewhere in this app degrades (D1 simply
// returns zero rows for a well-formed-but-nonexistent date).
function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

export default async function DaySheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam && isValidISODate(dateParam) ? dateParam : todayISO();
  const sheet = await getDaySheet(date);

  const totalGuests = (a: number, c: number, i: number) => a + c + i;

  return (
    <div className="pr-sheet">
      <div className="pr-dash-head no-print">
        <h1>Day sheet</h1>
        <div className="pr-dash-actions">
          <Link href={`/dashboard/day-sheet?date=${addDaysISO(date, -1)}`} className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
            &larr; Prev
          </Link>
          <Link href={`/dashboard/day-sheet?date=${todayISO()}`} className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
            Today
          </Link>
          <Link href={`/dashboard/day-sheet?date=${addDaysISO(date, 1)}`} className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
            Next &rarr;
          </Link>
        </div>
        <p>Print this page (Cmd/Ctrl+P) for the paper manifest -- the date nav and check-in boxes drop out.</p>
      </div>

      {/* The printed manifest's own title: the screen h1 is hidden in print
          (it sits in .no-print chrome), so the date has to carry the sheet. */}
      <h2 className="pr-sheet-date">{date}</h2>

      <h3 className="pr-sheet-section">Tour departures</h3>
      {sheet.sessions.length === 0 && <div className="pr-dash-empty">No tour departures scheduled.</div>}
      {sheet.sessions.map((session) => (
        <div key={session.id} className="pr-dash-card pr-sheet-block">
          <h4 className="pr-sheet-title">
            {session.start_time} &mdash; {session.tour_name}{" "}
            <span>
              ({session.booked_count} / {session.capacity - session.allotment_hold} booked)
            </span>
          </h4>
          {session.bookings.length === 0 ? (
            <div className="pr-dash-empty">No bookings for this departure.</div>
          ) : (
            <div className="pr-dash-tablewrap pr-sheet-tablewrap">
              <table className="pr-dash-table pr-sheet-table">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Party</th>
                    <th>Pickup zone</th>
                    <th>Hotel</th>
                    <th>Phone</th>
                    <th>Consent</th>
                    <th>Waivers</th>
                    <th>Notes</th>
                    <th className="no-print">Checked in</th>
                  </tr>
                </thead>
                <tbody>
                  {session.bookings.map((b) => {
                    const party = totalGuests(b.adults, b.children, b.infants);
                    const waiversIncomplete = b.signed_waivers < party;
                    return (
                      <tr key={b.id}>
                        <td>{b.guest_name}</td>
                        <td>{party}</td>
                        <td>{b.pickup_zone_name ?? "--"}</td>
                        <td>{b.hotel ?? "--"}</td>
                        <td>{b.guest_phone ?? "--"}</td>
                        <td>{b.waiver_acknowledged ? "Yes" : "No"}</td>
                        {/* Bold the incomplete case: this is the column crew scan
                            down each morning to catch who still needs to sign
                            before departure (plan §7), so "not all signed" has to
                            be the thing that catches the eye, not blend in. Kept as
                            weight, not colour -- the sheet gets printed in mono. */}
                        <td className={waiversIncomplete ? "pr-sheet-flag" : undefined}>
                          {b.signed_waivers} / {party}
                        </td>
                        <td>{b.notes ?? ""}</td>
                        <td className="no-print">
                          <form action={toggleCheckedIn.bind(null, b.id)} className="pr-dash-actions">
                            {/* key forces a remount when checked_in changes -- without it,
                                React's uncontrolled checkbox keeps its stale DOM state across
                                a same-page re-render triggered by submitting a DIFFERENT row's
                                form (this page has many independently-submittable checkboxes,
                                unlike the single-booking detail page). Same fix as the status
                                <select>'s key in dashboard/bookings/[id]/page.tsx. Confirmed
                                live: without this key, checking in one guest then submitting a
                                second guest's row left the first guest's box unchecked on
                                screen even though D1 had already recorded checked_in=1. */}
                            <input type="checkbox" name="checked_in" defaultChecked={b.checked_in === 1} key={b.checked_in} />
                            <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                              Update
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <h3 className="pr-sheet-section">Camp arrivals</h3>
      {sheet.campArrivals.length === 0 ? (
        <div className="pr-dash-empty">No campers arriving.</div>
      ) : (
        <div className="pr-dash-card pr-sheet-block">
          <div className="pr-dash-tablewrap pr-sheet-tablewrap">
            <table className="pr-dash-table pr-sheet-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Party</th>
                  <th>Zone</th>
                  <th>Unit</th>
                  <th>Phone</th>
                  <th>Departing</th>
                  <th>Notes</th>
                  <th className="no-print">Checked in</th>
                </tr>
              </thead>
              <tbody>
                {sheet.campArrivals.map((b) => (
                  <tr key={b.id}>
                    <td>{b.guest_name}</td>
                    <td>{totalGuests(b.adults, b.children, b.infants)}</td>
                    <td>{b.zone_name}</td>
                    <td>{b.unit_name}</td>
                    <td>{b.guest_phone ?? "--"}</td>
                    <td>{b.check_out}</td>
                    <td>{b.notes ?? ""}</td>
                    <td className="no-print">
                      <form action={toggleCheckedIn.bind(null, b.id)} className="pr-dash-actions">
                        {/* key forces a remount when checked_in changes -- see the matching
                            comment on the tour roster's checkbox above. */}
                        <input type="checkbox" name="checked_in" defaultChecked={b.checked_in === 1} key={b.checked_in} />
                        <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 className="pr-sheet-section">Camp departures</h3>
      {sheet.campDepartures.length === 0 ? (
        <div className="pr-dash-empty">No campers departing.</div>
      ) : (
        <div className="pr-dash-card pr-sheet-block">
          <ul className="pr-sheet-list">
            {sheet.campDepartures.map((b) => (
              <li key={b.id}>
                {b.guest_name} &mdash; {b.zone_name} / {b.unit_name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
