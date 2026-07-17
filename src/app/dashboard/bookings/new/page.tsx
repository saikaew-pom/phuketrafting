import { listTours } from "@/lib/queries/tours";
import { listPickupZones } from "@/lib/queries/pickup";
import { listTourSessionsForAdmin } from "@/lib/scheduling";
import { bangkokTodayISO } from "@/lib/format";
import { createStaffBooking } from "../actions";

// Bangkok-today for the default date range, consistent with the day sheet and
// availability calendars. (Audit A7.)
function todayISO(): string {
  return bangkokTodayISO();
}
function addDaysISO(days: number): string {
  const d = new Date(`${bangkokTodayISO()}T00:00:00Z`);
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
      <div className="pr-dash-head">
        <h1>New booking</h1>
        <p>
          For phone and walk-in bookings, or to add a guest to a departure that&apos;s already full (tick
          &quot;Allow overbook&quot;).
        </p>
      </div>

      <form method="get" className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>Find a departure</h2>
        <div className="pr-dash-actions">
          <select name="tourId" defaultValue={tourId} style={{ width: "auto" }}>
            {activeTours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            From <input type="date" name="fromDate" defaultValue={fromDate} style={{ width: "auto" }} />
          </label>
          <label className="pr-dash-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            To <input type="date" name="toDate" defaultValue={toDate} style={{ width: "auto" }} />
          </label>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Load departures
          </button>
        </div>
      </form>

      {sessions.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">No departures in this date range for this tour.</div>
        </div>
      ) : (
        <form action={createStaffBooking} className="pr-dash-form">
          <input type="hidden" name="tour_id" value={tourId} />

          <div className="pr-dash-card">
            <h2>Departure</h2>
            <label className="pr-dash-field">
              Date
              <select name="tour_session_id" required defaultValue="">
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
          </div>

          <div className="pr-dash-card">
            <h2>Guest</h2>
            <div className="pr-dash-form">
              <label className="pr-dash-field">
                Name
                <input name="guest_name" required maxLength={120} />
              </label>
              <label className="pr-dash-field">
                Email
                <input type="email" name="guest_email" />
              </label>
              <label className="pr-dash-field">
                Phone
                <input type="tel" name="guest_phone" maxLength={40} />
              </label>
              <div className="pr-dash-actions">
                <label className="pr-dash-field" style={{ maxWidth: "110px" }}>
                  Adults
                  <input type="number" name="adults" min={0} max={20} defaultValue={2} />
                </label>
                <label className="pr-dash-field" style={{ maxWidth: "110px" }}>
                  Children
                  <input type="number" name="children" min={0} max={20} defaultValue={0} />
                </label>
                <label className="pr-dash-field" style={{ maxWidth: "110px" }}>
                  Infants
                  <input type="number" name="infants" min={0} max={20} defaultValue={0} />
                </label>
              </div>
            </div>
          </div>

          <div className="pr-dash-card">
            <h2>Trip details</h2>
            <div className="pr-dash-form">
              <label className="pr-dash-field">
                Pickup zone
                <select name="pickup_zone_id">
                  <option value="">No pickup</option>
                  {pickupZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pr-dash-field">
                Hotel
                <input name="hotel" maxLength={200} />
              </label>
              <label className="pr-dash-field">
                Add-on
                <input name="addon_choice" maxLength={60} />
              </label>
              <label className="pr-dash-field">
                Promo code
                <input name="promo_code" maxLength={40} />
              </label>
            </div>
          </div>

          <div className="pr-dash-card">
            <label className="pr-dash-check">
              <input type="checkbox" name="allow_overbook" /> Allow overbook (add this guest even if the departure is
              full)
            </label>
          </div>

          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn">
              Create booking
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
