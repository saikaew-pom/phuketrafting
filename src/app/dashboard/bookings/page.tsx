import Link from "next/link";
import { listBookings } from "@/lib/queries/bookings";
import { baht } from "@/lib/format";

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
      <h1>Bookings</h1>
      <p>
        <Link href="/dashboard/bookings/new">+ New booking</Link>
      </p>
      <form method="get" style={{ margin: "16px 0" }}>
        <label>
          Status{" "}
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Filter</button>
      </form>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px" }}>Guest</th>
            <th style={{ padding: "8px" }}>Type</th>
            <th style={{ padding: "8px" }}>Product</th>
            <th style={{ padding: "8px" }}>Date</th>
            <th style={{ padding: "8px" }}>Status</th>
            <th style={{ padding: "8px" }}>Payment</th>
            <th style={{ padding: "8px" }}>Total</th>
            <th style={{ padding: "8px" }}>Source</th>
            <th style={{ padding: "8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>{b.guest_name}</td>
              <td style={{ padding: "8px" }}>{b.type}</td>
              <td style={{ padding: "8px" }}>{b.product_name ?? "—"}</td>
              <td style={{ padding: "8px" }}>{b.date ?? "—"}</td>
              <td style={{ padding: "8px" }}>{b.status}</td>
              <td style={{ padding: "8px" }}>{b.payment_status}</td>
              <td style={{ padding: "8px" }}>{baht(b.total)}</td>
              <td style={{ padding: "8px" }}>{b.source}</td>
              <td style={{ padding: "8px" }}>
                <Link href={`/dashboard/bookings/${b.id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bookings.length === 0 && <p>No bookings{status ? ` with status "${status}"` : ""}.</p>}
    </div>
  );
}
