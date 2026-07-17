import Link from "next/link";
import { listTours } from "@/lib/queries/tours";
import { createTourAction, deleteTourAction, moveTourAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name_required: "Give the tour a name.",
  bad_price: "Enter a starting adult price (0 or more).",
  duplicate_code: "That code is already used by another tour.",
  has_activity: "This tour has a schedule, bookings, reviews, or a promo scoped to it, so it can't be deleted. Untick Active on its page to retire it instead.",
};

export default async function ToursListPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const tours = await listTours();
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Tours</h1>
        <p>Order here is the order they show on the site. New tours start hidden until you fill in their details.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Tours updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>New tour</h2>
        <form action={createTourAction} className="pr-dash-actions">
          <label className="pr-dash-field" style={{ maxWidth: "260px" }}>
            Name
            <input name="name" required maxLength={120} placeholder="e.g. Sunset Rafting" />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "140px" }}>
            Code (optional)
            <input name="code" maxLength={20} placeholder="e.g. B7" />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "160px" }}>
            Adult price (฿)
            <input type="number" name="adult_price" min="0" step="1" required />
          </label>
          <button type="submit" className="pr-dash-btn">Create tour</button>
        </form>
      </div>

      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Code</th>
              <th>Name</th>
              <th>Distance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tours.map((tour, i) => (
              <tr key={tour.id}>
                <td>
                  <div className="pr-dash-actions">
                    <form action={moveTourAction.bind(null, tour.id, "up")}>
                      <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>↑</button>
                    </form>
                    <form action={moveTourAction.bind(null, tour.id, "down")}>
                      <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === tours.length - 1}>↓</button>
                    </form>
                  </div>
                </td>
                <td>{tour.code}</td>
                <td>{tour.name}</td>
                <td>{tour.distance_km ? `${tour.distance_km} km` : "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (tour.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {tour.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td>
                  <div className="pr-dash-actions">
                    <Link href={`/dashboard/products/tours/${tour.id}`}>Edit</Link>
                    <form action={deleteTourAction.bind(null, tour.id)}>
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
