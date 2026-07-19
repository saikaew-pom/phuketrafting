import Link from "next/link";
import { listTours } from "@/lib/queries/tours";
import { listTourCategories } from "@/lib/queries/tour-categories";
import { createTourAction, deleteTourAction, moveTourAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name_required: "Give the tour a name.",
  bad_price: "Enter a starting adult price (0 or more).",
  duplicate_code: "That code is already used by another tour.",
  has_activity: "This tour has a schedule, bookings, reviews, or a promo scoped to it, so it can't be deleted. Untick Active on its page to retire it instead.",
};

export default async function ToursListPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  // Independent D1 reads -- same Promise.all shape the public homepage uses
  // for its own listTours()/listTourCategories() pair.
  const [tours, categories] = await Promise.all([listTours(), listTourCategories()]);
  // Which categories actually render a section on the homepage -- a tour
  // featured (show_on_home=1) but uncategorised, or filed under a hidden
  // category, is invisible on the site even though staff flagged it. The
  // homepage silently drops it (see [lang]/page.tsx's homeSections filter);
  // this list is where staff would otherwise have no way to notice. (F4-style
  // gap closed after the future-proof-tours review flagged it.)
  const activeCategoryIds = new Set(categories.filter((c) => c.is_active === 1).map((c) => c.id));
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
            {tours.map((tour, i) => {
              // Featured but won't actually render anywhere on the homepage --
              // either no category was ever assigned, or its category was
              // later hidden. Both leave the tour invisible on the site while
              // "Feature on the homepage" still shows checked on its edit page.
              const wontShow = tour.show_on_home === 1 && (!tour.category_id || !activeCategoryIds.has(tour.category_id));
              return (
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
                    {wontShow && (
                      <span
                        className="pr-dash-badge pr-dash-badge-warn"
                        style={{ marginLeft: "6px" }}
                        title={
                          tour.category_id
                            ? "Featured on the homepage, but its category is hidden -- it won't appear until you show that category or move this tour to one that's shown."
                            : "Featured on the homepage, but it has no category -- it won't appear anywhere until you assign one on this tour's edit page."
                        }
                      >
                        Won&apos;t show
                      </span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
