import { notFound } from "next/navigation";
import { getBookingDetail, listBookingLogs } from "@/lib/queries/bookings";
import { listParticipants } from "@/lib/queries/participants";
import { changeBookingStatus, toggleCheckedIn, saveBookingNotes, notifyGuestEmail, markWhatsAppSent, refundBooking } from "../actions";
import { requireStaff } from "@/lib/access";
import { baht, formatDateTime } from "@/lib/format";
import { guestWaLink } from "@/lib/whatsapp";
import { STATUS_LABEL, STATUS_BADGE, PAYMENT_LABEL, PAYMENT_BADGE, SOURCE_LABEL } from "../labels";

const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await getBookingDetail(id);
  if (!booking) notFound();

  const logs = await listBookingLogs(id);
  // Drives whether the refund form renders at all. The action re-checks the
  // role itself (requireAdmin) -- this only avoids showing a button that would
  // reject. Never the security boundary.
  const staff = await requireStaff();
  const participants = await listParticipants(id);
  const changeStatusWithId = changeBookingStatus.bind(null, id);
  const toggleCheckedInWithId = toggleCheckedIn.bind(null, id);
  const saveNotesWithId = saveBookingNotes.bind(null, id);
  const notifyEmailWithId = notifyGuestEmail.bind(null, id);
  const markWhatsAppSentWithId = markWhatsAppSent.bind(null, id);
  const refundWithId = refundBooking.bind(null, id);
  const whatsAppMessage = `Hi ${booking.guest_name}, this is Phuket Rafting confirming we've received your booking for ${
    booking.product_name ?? "your trip"
  } on ${booking.date ?? ""}. We'll follow up with pickup details soon!`;

  const signedCount = participants.filter((p) => p.waiver_signed_at !== null).length;
  const participantCount = booking.adults + booking.children + booking.infants;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>{booking.guest_name}</h1>
        <div className="pr-dash-actions">
          <span className={"pr-dash-badge " + (STATUS_BADGE[booking.status] ?? "pr-dash-badge-neutral")}>
            {STATUS_LABEL[booking.status] ?? booking.status}
          </span>
          <span className={"pr-dash-badge " + (PAYMENT_BADGE[booking.payment_status] ?? "pr-dash-badge-neutral")}>
            {PAYMENT_LABEL[booking.payment_status] ?? booking.payment_status}
          </span>
        </div>
        <p>
          {booking.product_name ?? "--"} &middot; {booking.date ?? "--"} &middot; via{" "}
          {SOURCE_LABEL[booking.source] ?? booking.source}
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Trip</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px" }}>
          {booking.adults} adult{booking.adults === 1 ? "" : "s"}, {booking.children} child
          {booking.children === 1 ? "" : "ren"}, {booking.infants} infant{booking.infants === 1 ? "" : "s"}
          {booking.type === "camp" && (
            <>
              <br />
              {booking.check_in} &rarr; {booking.check_out}
            </>
          )}
          {booking.hotel && (
            <>
              <br />
              Hotel: {booking.hotel}
            </>
          )}
          {booking.pickup_zone_name && (
            <>
              <br />
              Pickup: {booking.pickup_zone_name}
            </>
          )}
          {booking.addon_choice && (
            <>
              <br />
              Add-on: {booking.addon_choice}
            </>
          )}
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Contact</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px" }}>
          Email: {booking.guest_email ?? "--"}
          <br />
          Phone: {booking.guest_phone ?? "--"}
          <br />
          Language: {booking.locale}
          <br />
          Marketing consent: {booking.consent_marketing ? "Yes" : "No"}
          <br />
          Waiver acknowledged: {booking.waiver_acknowledged ? "Yes" : "No"}
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Status</h2>
        <div className="pr-dash-form">
          <form action={changeStatusWithId} className="pr-dash-actions">
            {/* key forces a remount when booking.status changes -- without it, React's
                uncontrolled <select> keeps restoring its ORIGINAL mount-time selection on
                every re-render (it caches the initial value internally and re-applies it
                on each commit), so after a successful status update + revalidatePath the
                dropdown silently reverted to the page's original status instead of showing
                the value that was just saved, even though the write itself succeeded.
                Confirmed live: the server-sent RSC payload already carried the correct new
                defaultValue, but the mounted DOM node ignored it without this key. */}
            {/* Once a booking is cancelled its seat has been released, so
                reopening it here is disabled -- changeBookingStatus refuses the
                transition server-side (a reopen without re-claiming would
                silently overbook), and staff re-add a guest with a new booking.
                Disabling the options keeps that refusal out of a normal staff
                member's way. (Audit A1.) */}
            <select name="status" defaultValue={booking.status} key={booking.status} style={{ width: "auto" }}>
              {STATUSES.map((s) => (
                <option key={s} value={s} disabled={booking.status === "cancelled" && s !== "cancelled"}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="pr-dash-btn pr-dash-btn-sm">
              Update status
            </button>
            {booking.status === "cancelled" && (
              <span className="pr-dash-field-hint">
                Cancelled &mdash; its seat was released. Create a new booking to re-add the guest.
              </span>
            )}
          </form>

          <form action={toggleCheckedInWithId} className="pr-dash-actions">
            <label className="pr-dash-check">
              <input type="checkbox" name="checked_in" defaultChecked={booking.checked_in === 1} /> Checked in
            </label>
            <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="pr-dash-card">
        <h2>Pricing</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px" }}>
          Subtotal: {baht(booking.subtotal)}
          <br />
          Discount: {baht(booking.discount_amount)}
          {booking.transfer_fee > 0 && (
            <>
              <br />
              Transfer fee: {baht(booking.transfer_fee)}
            </>
          )}
          <br />
          <strong style={{ color: "var(--ink)" }}>Total: {baht(booking.total)}</strong> ({booking.currency})
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Payment</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px", marginBottom: "12px" }}>
          Deposit: {baht(booking.deposit_amount)} &middot; Balance on the day: {baht(booking.balance_amount)}
          {booking.stripe_checkout_session_id && (
            <>
              <br />
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "var(--ink-3)" }}>
                {booking.stripe_checkout_session_id}
              </span>
            </>
          )}
        </p>
        {/* Admin-only, and only for a booking that actually has money to give
            back. The action re-checks the role regardless (Server Actions are
            independently POST-reachable) -- hiding it is a courtesy, not a gate. */}
        {staff.role === "admin" && booking.payment_status === "paid" && booking.stripe_checkout_session_id && (
          <form action={refundWithId} className="pr-dash-form">
            <label className="pr-dash-field">
              Refund reason (goes on the Stripe record and the audit log)
              <input name="refund_reason" required maxLength={500} />
            </label>
            <div className="pr-dash-actions">
              <button type="submit" className="pr-dash-btn pr-dash-btn-danger">
                Refund {baht(booking.deposit_amount)} deposit
              </button>
            </div>
          </form>
        )}
        {staff.role !== "admin" && booking.payment_status === "paid" && (
          <p className="pr-dash-field-hint">Refunds require an admin account.</p>
        )}
      </div>

      <div className="pr-dash-card">
        <h2>Waivers</h2>
        {/* Read-only on purpose: a waiver is the participant's own signed legal
            declaration (plan §7), so staff seeing it is right but staff editing
            it would defeat the point of collecting it. Guests sign/correct via
            their manage-booking link. */}
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px", marginBottom: participants.length ? "12px" : 0 }}>
          {participants.length === 0
            ? "No participant waivers signed yet."
            : `${signedCount} of ${participantCount} participants have signed.`}
        </p>
        {participants.length > 0 && (
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Health declaration</th>
                  <th>Signed</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.age ?? "--"}</td>
                    <td>{p.health_declaration || "None declared"}</td>
                    <td>{p.waiver_signed_at ? formatDateTime(p.waiver_signed_at) : "--"}</td>
                    <td>{p.signature_text ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pr-dash-card">
        <h2>Notes</h2>
        <form action={saveNotesWithId} className="pr-dash-form">
          <label className="pr-dash-field">
            <textarea name="notes" defaultValue={booking.notes ?? ""} rows={4} />
            <span className="pr-dash-field-hint">Internal only -- guests never see these.</span>
          </label>
          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
              Save notes
            </button>
          </div>
        </form>
      </div>

      <div className="pr-dash-card">
        <h2>Notifications</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14.5px", marginBottom: "8px" }}>
          Email:{" "}
          {booking.last_email_status
            ? `${booking.last_email_status} (${formatDateTime(booking.last_email_sent_at!)})`
            : "Not yet sent"}
        </p>
        <form action={notifyEmailWithId} className="pr-dash-actions" style={{ marginBottom: "16px" }}>
          <button type="submit" className="pr-dash-btn pr-dash-btn-sm" disabled={!booking.guest_email}>
            Send booking confirmation email
          </button>
          {!booking.guest_email && <span className="pr-dash-field-hint">No email on file.</span>}
        </form>

        <p style={{ color: "var(--ink-2)", fontSize: "14.5px", marginBottom: "8px" }}>
          WhatsApp:{" "}
          {booking.last_whatsapp_status
            ? `${booking.last_whatsapp_status} (${formatDateTime(booking.last_whatsapp_sent_at!)})`
            : "Not yet sent"}
        </p>
        {booking.guest_phone ? (
          <div className="pr-dash-actions">
            <a
              className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
              href={guestWaLink(booking.guest_phone, whatsAppMessage)}
              target="_blank"
              rel="noreferrer"
            >
              Message on WhatsApp
            </a>
            <form action={markWhatsAppSentWithId}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                Mark as sent
              </button>
            </form>
          </div>
        ) : (
          <p className="pr-dash-field-hint">No phone on file.</p>
        )}
      </div>

      <div className="pr-dash-card">
        <h2>Activity log</h2>
        {logs.length === 0 ? (
          <div className="pr-dash-empty">No activity yet.</div>
        ) : (
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.actor}</td>
                    <td>{log.action}</td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
