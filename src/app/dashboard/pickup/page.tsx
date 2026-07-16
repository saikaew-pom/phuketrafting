import Link from "next/link";
import { listAllPickupZones } from "@/lib/queries/pickup";
import { baht } from "@/lib/format";

export default async function PickupZonesPage() {
  const zones = await listAllPickupZones();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Pickup zones</h1>
        <Link href="/dashboard/pickup/new" className="pr-dash-btn">
          + New zone
        </Link>
      </div>
      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Transfer fee</th>
              <th>Earliest pickup</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>{z.name}</td>
                <td>{z.fee > 0 ? baht(z.fee) : "Free"}</td>
                <td>{z.earliest_pickup_time ?? "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (z.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {z.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/pickup/${z.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
            {zones.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="pr-dash-empty">No pickup zones yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
