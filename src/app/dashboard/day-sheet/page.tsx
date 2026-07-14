import Link from "next/link";
import { getDaySheet } from "@/lib/queries/bookings";
import { toggleCheckedIn } from "../bookings/actions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
    <div>
      {/* Browser print (Cmd/Ctrl+P) -> PDF is the "printable manifest" -- no
          server-side PDF generation dependency, which the Workers runtime
          doesn't support well. Hides the date-nav chrome, keeps the rosters. */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <h1 style={{ margin: 0 }}>Day sheet</h1>
        <Link href={`/dashboard/day-sheet?date=${addDaysISO(date, -1)}`}>&larr; Prev day</Link>
        <Link href={`/dashboard/day-sheet?date=${todayISO()}`}>Today</Link>
        <Link href={`/dashboard/day-sheet?date=${addDaysISO(date, 1)}`}>Next day &rarr;</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>{date}</h2>

      <h3>Tour departures</h3>
      {sheet.sessions.length === 0 && <p>No tour sessions scheduled.</p>}
      {sheet.sessions.map((session) => (
        <div key={session.id} style={{ marginBottom: "24px" }}>
          <h4 style={{ marginBottom: "4px" }}>
            {session.start_time} &mdash; {session.tour_name}{" "}
            <span style={{ fontWeight: "normal", color: "#666" }}>
              ({session.booked_count} / {session.capacity - session.allotment_hold} booked)
            </span>
          </h4>
          {session.bookings.length === 0 ? (
            <p>No bookings for this session.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: "6px" }}>Guest</th>
                  <th style={{ padding: "6px" }}>Party</th>
                  <th style={{ padding: "6px" }}>Pickup zone</th>
                  <th style={{ padding: "6px" }}>Hotel</th>
                  <th style={{ padding: "6px" }}>Phone</th>
                  <th style={{ padding: "6px" }}>Waiver</th>
                  <th style={{ padding: "6px" }}>Notes</th>
                  <th style={{ padding: "6px" }} className="no-print">
                    Checked in
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.bookings.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px" }}>{b.guest_name}</td>
                    <td style={{ padding: "6px" }}>{totalGuests(b.adults, b.children, b.infants)}</td>
                    <td style={{ padding: "6px" }}>{b.pickup_zone_name ?? "—"}</td>
                    <td style={{ padding: "6px" }}>{b.hotel ?? "—"}</td>
                    <td style={{ padding: "6px" }}>{b.guest_phone ?? "—"}</td>
                    <td style={{ padding: "6px" }}>{b.waiver_acknowledged ? "Yes" : "No"}</td>
                    <td style={{ padding: "6px" }}>{b.notes ?? ""}</td>
                    <td style={{ padding: "6px" }} className="no-print">
                      <form action={toggleCheckedIn.bind(null, b.id)}>
                        <label>
                          {/* key forces a remount when checked_in changes -- without it,
                              React's uncontrolled checkbox keeps its stale DOM state across
                              a same-page re-render triggered by submitting a DIFFERENT row's
                              form (this page has many independently-submittable checkboxes,
                              unlike the single-booking detail page). Same fix as the status
                              <select>'s key in dashboard/bookings/[id]/page.tsx. Confirmed
                              live: without this key, checking in one guest then submitting a
                              second guest's row left the first guest's box unchecked on
                              screen even though D1 had already recorded checked_in=1. */}
                          <input
                            type="checkbox"
                            name="checked_in"
                            defaultChecked={b.checked_in === 1}
                            key={b.checked_in}
                          />{" "}
                          <button type="submit">Update</button>
                        </label>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <h3>Camp arrivals</h3>
      {sheet.campArrivals.length === 0 ? (
        <p>No campers arriving.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "24px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "6px" }}>Guest</th>
              <th style={{ padding: "6px" }}>Party</th>
              <th style={{ padding: "6px" }}>Zone</th>
              <th style={{ padding: "6px" }}>Unit</th>
              <th style={{ padding: "6px" }}>Phone</th>
              <th style={{ padding: "6px" }}>Departing</th>
              <th style={{ padding: "6px" }}>Notes</th>
              <th style={{ padding: "6px" }} className="no-print">
                Checked in
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.campArrivals.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px" }}>{b.guest_name}</td>
                <td style={{ padding: "6px" }}>{totalGuests(b.adults, b.children, b.infants)}</td>
                <td style={{ padding: "6px" }}>{b.zone_name}</td>
                <td style={{ padding: "6px" }}>{b.unit_name}</td>
                <td style={{ padding: "6px" }}>{b.guest_phone ?? "—"}</td>
                <td style={{ padding: "6px" }}>{b.check_out}</td>
                <td style={{ padding: "6px" }}>{b.notes ?? ""}</td>
                <td style={{ padding: "6px" }} className="no-print">
                  <form action={toggleCheckedIn.bind(null, b.id)}>
                    <label>
                      {/* key forces a remount when checked_in changes -- see the matching
                          comment on the tour roster's checkbox above. */}
                      <input
                        type="checkbox"
                        name="checked_in"
                        defaultChecked={b.checked_in === 1}
                        key={b.checked_in}
                      />{" "}
                      <button type="submit">Update</button>
                    </label>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Camp departures</h3>
      {sheet.campDepartures.length === 0 ? (
        <p>No campers departing.</p>
      ) : (
        <ul>
          {sheet.campDepartures.map((b) => (
            <li key={b.id}>
              {b.guest_name} &mdash; {b.zone_name} / {b.unit_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
