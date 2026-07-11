import Link from "next/link";
import { listCampZones } from "@/lib/queries/camping";

export default async function CampingListPage() {
  const zones = await listCampZones();

  return (
    <div>
      <h1>Camping Zones</h1>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "16px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px" }}>Name</th>
            <th style={{ padding: "8px" }}>Sleeps</th>
            <th style={{ padding: "8px" }}>Active</th>
            <th style={{ padding: "8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => (
            <tr key={zone.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>{zone.name}</td>
              <td style={{ padding: "8px" }}>{zone.sleeps_label}</td>
              <td style={{ padding: "8px" }}>{zone.is_active ? "Yes" : "No"}</td>
              <td style={{ padding: "8px" }}>
                <Link href={`/dashboard/products/camping/${zone.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
