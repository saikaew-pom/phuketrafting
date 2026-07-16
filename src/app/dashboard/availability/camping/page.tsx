import Link from "next/link";
import { listCampZones, listCampUnits } from "@/lib/queries/camping";
import { listCampStaysForAdmin } from "@/lib/scheduling";

const WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

// Bangkok is UTC+7 year-round (no DST), so "today" is today's date there --
// same shift the session generator and the tours calendar use.
function todayISO(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Same guard as the tours calendar and the day sheet: a hand-edited ?from=
// must not 500 the page.
function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/**
 * The camp availability calendar -- the camping counterpart to the tour
 * session calendar next door.
 *
 * It is a grid, not a list, because camp availability is a different question:
 * a tour departure has a seat count on one date, while a tent is either free
 * or occupied across a *range* of nights. One stay paints several cells.
 *
 * There is no "generate" button here and no equivalent of session_templates:
 * tents aren't scheduled into existence, they simply exist. Availability is
 * derived live from camp_units plus the bookings overlapping the window, which
 * is exactly what claimCampUnitBooking checks at booking time -- so what staff
 * see here and what a guest can actually book cannot drift apart.
 */
export default async function CampAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ zoneId?: string; from?: string; days?: string }>;
}) {
  const params = await searchParams;
  const zones = await listCampZones();
  const activeZones = zones.filter((z) => z.is_active === 1);

  const zoneId =
    params.zoneId && activeZones.some((z) => z.id === params.zoneId)
      ? params.zoneId
      : (activeZones[0]?.id ?? "");
  const from = params.from && isValidISODate(params.from) ? params.from : todayISO();
  const days = Number(params.days) > 0 ? Math.min(Number(params.days), MAX_WINDOW_DAYS) : WINDOW_DAYS;
  const to = addDaysISO(from, days);

  const [units, stays] = zoneId
    ? await Promise.all([listCampUnits(zoneId), listCampStaysForAdmin(zoneId, from, to)])
    : [[], []];

  const nights = Array.from({ length: days }, (_, i) => addDaysISO(from, i));

  // One stay covers every night from check_in up to (not including) check_out
  // -- the same half-open range the booking guard uses. Keyed by unit+night so
  // a cell lookup is a map hit rather than a scan per cell.
  const occupied = new Map<string, (typeof stays)[number]>();
  for (const stay of stays) {
    for (const night of nights) {
      if (stay.check_in <= night && night < stay.check_out) {
        occupied.set(`${stay.camp_unit_id}|${night}`, stay);
      }
    }
  }

  const zoneName = activeZones.find((z) => z.id === zoneId)?.name ?? "";

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Camp availability</h1>
        <p>
          Which tents are free, night by night. A tent is bookable when it&apos;s active, in service, and nobody is
          staying in it. To add or retire a tent, or take one out of service, open{" "}
          {zoneId ? <Link href={`/dashboard/products/camping/${zoneId}`}>the zone</Link> : "the zone"}.{" "}
          <Link href="/dashboard/availability">Tour departures are here</Link>.
        </p>
      </div>

      <form method="get" className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <div className="pr-dash-actions">
          <select name="zoneId" defaultValue={zoneId} style={{ width: "auto" }}>
            {activeZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            From <input type="date" name="from" defaultValue={from} style={{ width: "auto" }} />
          </label>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            Nights{" "}
            <input
              type="number"
              name="days"
              min={1}
              max={MAX_WINDOW_DAYS}
              defaultValue={days}
              style={{ width: "90px" }}
            />
          </label>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Show
          </button>
        </div>
      </form>

      {activeZones.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">
            No active camp zones. <Link href="/dashboard/products/camping">Add or activate one</Link> first.
          </div>
        </div>
      ) : units.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">
            {zoneName} has no tents yet, so nothing here can be booked.
            <br />
            <Link href={`/dashboard/products/camping/${zoneId}`}>Add tents to {zoneName}</Link>.
          </div>
        </div>
      ) : (
        <div className="pr-dash-tablewrap">
          <table className="pr-dash-table pr-camp-grid">
            <thead>
              <tr>
                <th className="pr-camp-unitcol">Tent</th>
                {nights.map((night) => (
                  <th key={night} className="pr-camp-night" title={night}>
                    {night.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td className="pr-camp-unitcol">
                    {unit.name}
                    <span className="pr-dash-field-hint"> sleeps {unit.occupancy}</span>
                    {unit.is_blocked ? (
                      <span className="pr-dash-badge pr-dash-badge-danger">Out</span>
                    ) : unit.is_active ? null : (
                      <span className="pr-dash-badge pr-dash-badge-warn">Hidden</span>
                    )}
                  </td>
                  {nights.map((night) => {
                    const stay = occupied.get(`${unit.id}|${night}`);
                    // Order matters: a booked night is shown as booked even on
                    // a tent that's since been blocked or deactivated. Those
                    // guests still exist and still turn up -- painting the cell
                    // "out of service" would hide a real stay from the person
                    // reading this to plan the night.
                    if (stay) {
                      return (
                        <td key={night} className="pr-camp-cell pr-camp-booked" title={`${stay.guest_name ?? "Guest"} -- ${stay.check_in} to ${stay.check_out} (${stay.status})`}>
                          <Link href={`/dashboard/bookings/${stay.booking_id}`}>&#9679;</Link>
                        </td>
                      );
                    }
                    if (unit.is_blocked) {
                      return <td key={night} className="pr-camp-cell pr-camp-blocked" title={unit.block_reason ?? "Out of service"} />;
                    }
                    if (!unit.is_active) {
                      return <td key={night} className="pr-camp-cell pr-camp-hidden" title="Not shown on the site" />;
                    }
                    return <td key={night} className="pr-camp-cell pr-camp-free" title={`${unit.name} free on ${night}`} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pr-dash-field-hint" style={{ marginTop: "16px" }}>
        <span className="pr-camp-key pr-camp-free" /> Free
        <span className="pr-camp-key pr-camp-booked" /> Booked (click to open)
        <span className="pr-camp-key pr-camp-blocked" /> Out of service
        <span className="pr-camp-key pr-camp-hidden" /> Not on the site
      </p>
    </div>
  );
}
