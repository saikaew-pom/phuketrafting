import { listTours } from "@/lib/queries/tours";
import { listPickupZones } from "@/lib/queries/pickup";
import { listTourSessionsForAdmin } from "@/lib/scheduling";
import { createStaffBooking } from "../actions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ tourId?: string; fromDate?: string; toDate?: string }>;
}) {
  const params = await searchParams;
  const [tours, pickupZones] = await Promise.all([listTours(), listPickupZones()]);
  const activeTours = tours.filter((t) => t.is_active === 1);

  const tourId = params.tourId || activeTours[0]?.id || "";
  const fromDate = params.fromDate || todayISO();
  const toDate = params.toDate || addDaysISO(90);

  const sessions = tourId ? await listTourSessionsForAdmin(tourId, fromDate, toDate) : [];

  return (
    <div>
      <h1>New booking (staff-created)</h1>
      <p>
        For phone/walk-in bookings, or to add a guest to a session that&apos;s already full (check &quot;Allow
        overbook&quot; below).
      </p>

      <h2>Tour &amp; date range</h2>
      <form method="get" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <select name="tourId" defaultValue={tourId}>
          {activeTours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label>
          From <input type="date" name="fromDate" defaultValue={fromDate} />
        </label>
        <label>
          To <input type="date" name="toDate" defaultValue={toDate} />
        </label>
        <button type="submit">Load sessions</button>
      </form>

      <h2>Booking details</h2>
      {sessions.length === 0 ? (
        <p>No sessions in this date range for this tour.</p>
      ) : (
        <form action={createStaffBooking} style={{ maxWidth: "480px", display: "grid", gap: "10px" }}>
          <input type="hidden" name="tour_id" value={tourId} />

          <label>
            Session
            <select name="tour_session_id" required defaultValue="" style={{ display: "block", width: "100%" }}>
              <option value="" disabled>
                Choose a date
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} -- {s.start_time} ({s.booked_count} / {s.capacity - s.allotment_hold} booked
                  {s.is_blocked ? ", BLOCKED" : ""})
                </option>
              ))}
            </select>
          </label>

          <label>
            Guest name
            <input name="guest_name" required maxLength={120} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Email
            <input type="email" name="guest_email" style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Phone
            <input type="tel" name="guest_phone" maxLength={40} style={{ display: "block", width: "100%" }} />
          </label>

          <div style={{ display: "flex", gap: "12px" }}>
            <label>
              Adults
              <input type="number" name="adults" min={0} max={20} defaultValue={2} style={{ width: "70px" }} />
            </label>
            <label>
              Children
              <input type="number" name="children" min={0} max={20} defaultValue={0} style={{ width: "70px" }} />
            </label>
            <label>
              Infants
              <input type="number" name="infants" min={0} max={20} defaultValue={0} style={{ width: "70px" }} />
            </label>
          </div>

          <label>
            Pickup zone
            <select name="pickup_zone_id" style={{ display: "block", width: "100%" }}>
              <option value="">No pickup</option>
              {pickupZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hotel
            <input name="hotel" maxLength={200} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Add-on
            <input name="addon_choice" maxLength={60} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Promo code
            <input name="promo_code" maxLength={40} style={{ display: "block", width: "100%" }} />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input type="checkbox" name="allow_overbook" /> Allow overbook (add this guest even if the session is
            full)
          </label>

          <button type="submit" style={{ width: "fit-content" }}>
            Create booking
          </button>
        </form>
      )}
    </div>
  );
}
