import { notFound } from "next/navigation";
import { getBookingDetail, listBookingLogs } from "@/lib/queries/bookings";
import { changeBookingStatus, toggleCheckedIn, saveBookingNotes } from "../actions";
import { baht, formatDateTime } from "@/lib/format";

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await getBookingDetail(id);
  if (!booking) notFound();

  const logs = await listBookingLogs(id);
  const changeStatusWithId = changeBookingStatus.bind(null, id);
  const toggleCheckedInWithId = toggleCheckedIn.bind(null, id);
  const saveNotesWithId = saveBookingNotes.bind(null, id);

  return (
    <div>
      <h1>{booking.guest_name}</h1>
      <p>
        {booking.type} &middot; {booking.product_name ?? "—"} &middot; {booking.date ?? "—"}
      </p>

      <h2>Guests</h2>
      <p>
        {booking.adults} adult{booking.adults === 1 ? "" : "s"}, {booking.children} child
        {booking.children === 1 ? "" : "ren"}, {booking.infants} infant{booking.infants === 1 ? "" : "s"}
      </p>
      {booking.type === "camp" && (
        <p>
          {booking.check_in} &rarr; {booking.check_out}
        </p>
      )}
      {booking.hotel && <p>Hotel: {booking.hotel}</p>}
      {booking.pickup_zone_name && <p>Pickup: {booking.pickup_zone_name}</p>}
      {booking.addon_choice && <p>Add-on: {booking.addon_choice}</p>}

      <h2>Contact</h2>
      <p>Email: {booking.guest_email ?? "—"}</p>
      <p>Phone: {booking.guest_phone ?? "—"}</p>
      <p>Locale: {booking.locale}</p>
      <p>Source: {booking.source}</p>
      <p>Marketing consent: {booking.consent_marketing ? "Yes" : "No"}</p>
      <p>Waiver acknowledged: {booking.waiver_acknowledged ? "Yes" : "No"}</p>

      <h2>Pricing</h2>
      <p>Subtotal: {baht(booking.subtotal)}</p>
      <p>Discount: {baht(booking.discount_amount)}</p>
      {booking.transfer_fee > 0 && <p>Transfer fee: {baht(booking.transfer_fee)}</p>}
      <p>
        <strong>Total: {baht(booking.total)}</strong> ({booking.currency})
      </p>
      <p>Payment status: {booking.payment_status}</p>

      <h2>Status</h2>
      <form action={changeStatusWithId} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {/* key forces a remount when booking.status changes -- without it, React's
            uncontrolled <select> keeps restoring its ORIGINAL mount-time selection on
            every re-render (it caches the initial value internally and re-applies it
            on each commit), so after a successful status update + revalidatePath the
            dropdown silently reverted to the page's original status instead of showing
            the value that was just saved, even though the write itself succeeded.
            Confirmed live: the server-sent RSC payload already carried the correct new
            defaultValue, but the mounted DOM node ignored it without this key. */}
        <select name="status" defaultValue={booking.status} key={booking.status}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit">Update status</button>
      </form>

      <form action={toggleCheckedInWithId} style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
        <label>
          <input type="checkbox" name="checked_in" defaultChecked={booking.checked_in === 1} /> Checked in
        </label>
        <button type="submit">Update</button>
      </form>

      <h2>Notes</h2>
      <form action={saveNotesWithId} style={{ maxWidth: "480px", display: "grid", gap: "8px" }}>
        <textarea name="notes" defaultValue={booking.notes ?? ""} rows={4} style={{ width: "100%" }} />
        <button type="submit" style={{ width: "fit-content" }}>
          Save notes
        </button>
      </form>

      <h2>Activity log</h2>
      {logs.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "8px" }}>When</th>
              <th style={{ padding: "8px" }}>Actor</th>
              <th style={{ padding: "8px" }}>Action</th>
              <th style={{ padding: "8px" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px" }}>{formatDateTime(log.created_at)}</td>
                <td style={{ padding: "8px" }}>{log.actor}</td>
                <td style={{ padding: "8px" }}>{log.action}</td>
                <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "12px" }}>{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
