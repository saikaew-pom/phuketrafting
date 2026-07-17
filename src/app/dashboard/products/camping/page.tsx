import Link from "next/link";
import { listCampZones } from "@/lib/queries/camping";
import { createCampZoneAction, deleteCampZoneAction, moveCampZoneAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name_required: "Give the zone a name.",
  has_activity: "This zone has tents or bookings, so it can't be deleted. Untick Active on its page to retire it instead.",
};

export default async function CampingListPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const zones = await listCampZones();
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Camping zones</h1>
        <p>Order here is the order shown on the site. A new zone starts with three empty stay packages -- set their prices and add tents on its page.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Zones updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>New zone</h2>
        <form action={createCampZoneAction} className="pr-dash-actions">
          <label className="pr-dash-field" style={{ maxWidth: "300px" }}>
            Name
            <input name="name" required maxLength={120} placeholder="e.g. Riverside Deluxe" />
          </label>
          <button type="submit" className="pr-dash-btn">Create zone</button>
        </form>
      </div>

      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Sleeps</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone, i) => (
              <tr key={zone.id}>
                <td>
                  <div className="pr-dash-actions">
                    <form action={moveCampZoneAction.bind(null, zone.id, "up")}>
                      <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>↑</button>
                    </form>
                    <form action={moveCampZoneAction.bind(null, zone.id, "down")}>
                      <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === zones.length - 1}>↓</button>
                    </form>
                  </div>
                </td>
                <td>{zone.name}</td>
                <td>{zone.sleeps_label ?? "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (zone.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {zone.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <div className="pr-dash-actions">
                    <Link href={`/dashboard/products/camping/${zone.id}`}>Edit</Link>
                    <form action={deleteCampZoneAction.bind(null, zone.id)}>
                      <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
