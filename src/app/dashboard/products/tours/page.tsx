import Link from "next/link";
import { listTours } from "@/lib/queries/tours";

export default async function ToursListPage() {
  const tours = await listTours();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Tours</h1>
      </div>
      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Distance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tours.map((tour) => (
              <tr key={tour.id}>
                <td>{tour.code}</td>
                <td>{tour.name}</td>
                <td>{tour.distance_km ? `${tour.distance_km} km` : "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (tour.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {tour.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/products/tours/${tour.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
