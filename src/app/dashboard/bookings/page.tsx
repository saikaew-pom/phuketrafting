import Link from "next/link";
import { listBookings } from "@/lib/queries/bookings";
import { baht } from "@/lib/format";
import { STATUS_LABEL, STATUS_BADGE, PAYMENT_LABEL, PAYMENT_BADGE, SOURCE_LABEL } from "./labels";

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

export default async function BookingsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const bookings = await listBookings(status ? { status } : {});

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Bookings</h1>
        <Link href="/dashboard/bookings/new" className="pr-dash-btn">
          + New booking
        </Link>
      </div>

      <form method="get" className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <div className="pr-dash-actions">
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "10px" }}>
            Status
            <select name="status" defaultValue={status ?? ""} style={{ width: "auto" }}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Filter
          </button>
        </div>
      </form>

      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Product</th>
              <th>Date</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.guest_name}</td>
                <td>{b.product_name ?? "--"}</td>
                <td>{b.date ?? "--"}</td>
                <td>
                  <span className={"pr-dash-badge " + (STATUS_BADGE[b.status] ?? "pr-dash-badge-neutral")}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </td>
                <td>
                  <span className={"pr-dash-badge " + (PAYMENT_BADGE[b.payment_status] ?? "pr-dash-badge-neutral")}>
                    {PAYMENT_LABEL[b.payment_status] ?? b.payment_status}
                  </span>
                </td>
                <td>{baht(b.total)}</td>
                <td>{SOURCE_LABEL[b.source] ?? b.source}</td>
                <td>
                  <Link href={`/dashboard/bookings/${b.id}`}>View</Link>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="pr-dash-empty">
                    No bookings{status ? ` with status "${STATUS_LABEL[status] ?? status}"` : ""}.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
