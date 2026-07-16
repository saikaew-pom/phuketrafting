import Link from "next/link";
import { listCampZones } from "@/lib/queries/camping";

export default async function CampingListPage() {
  const zones = await listCampZones();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Camping zones</h1>
      </div>
      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Sleeps</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <tr key={zone.id}>
                <td>{zone.name}</td>
                <td>{zone.sleeps_label ?? "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (zone.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {zone.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/products/camping/${zone.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
