import Link from "next/link";
import { listTours } from "@/lib/queries/tours";

export default async function ToursListPage() {
  const tours = await listTours();

  return (
    <div>
      <h1>Tours</h1>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "16px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px" }}>Code</th>
            <th style={{ padding: "8px" }}>Name</th>
            <th style={{ padding: "8px" }}>Distance</th>
            <th style={{ padding: "8px" }}>Active</th>
            <th style={{ padding: "8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {tours.map((tour) => (
            <tr key={tour.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>{tour.code}</td>
              <td style={{ padding: "8px" }}>{tour.name}</td>
              <td style={{ padding: "8px" }}>{tour.distance_km} km</td>
              <td style={{ padding: "8px" }}>{tour.is_active ? "Yes" : "No"}</td>
              <td style={{ padding: "8px" }}>
                <Link href={`/dashboard/products/tours/${tour.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
