import Link from "next/link";
import { listAllReviews } from "@/lib/queries/reviews";
import { listTours } from "@/lib/queries/tours";

export default async function ReviewsListPage() {
  const [reviews, tours] = await Promise.all([listAllReviews(), listTours()]);
  const tourNameById = new Map(tours.map((t) => [t.id, t.name]));

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Reviews</h1>
        <Link href="/dashboard/reviews/new" className="pr-dash-btn">
          + New review
        </Link>
      </div>
      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Rating</th>
              <th>About</th>
              <th>Review</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.guest_name}
                  {r.guest_place && <> · {r.guest_place}</>}
                </td>
                <td>{"★".repeat(r.rating)}</td>
                <td>{r.tour_id ? (tourNameById.get(r.tour_id) ?? r.tour_id) : "Camping / general"}</td>
                <td style={{ maxWidth: "360px" }}>{r.content.length > 90 ? r.content.slice(0, 90) + "…" : r.content}</td>
                <td>
                  <span className={"pr-dash-badge " + (r.is_published ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {r.is_published ? "Published" : "Hidden"}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/reviews/${r.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="pr-dash-empty">No reviews yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
