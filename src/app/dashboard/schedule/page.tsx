import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { listTours } from "@/lib/queries/tours";
import { listSessionTemplates } from "@/lib/queries/session-templates";
import { addScheduleSlot, updateScheduleSlot, deleteScheduleSlot } from "./actions";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ERRORS: Record<string, string> = {
  no_tour: "Pick a tour first.",
  bad_day: "Choose a weekday.",
  bad_time: "Enter a valid time (HH:MM).",
  bad_capacity: "Seats must be a whole number of 1 or more.",
  duplicate: "This tour already runs at that day and time.",
  gone: "That slot no longer exists.",
};
const SAVED: Record<string, string> = {
  added: "Slot added — future departures generated.",
  updated: "Slot updated.",
  deleted: "Slot removed.",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ tourId?: string; error?: string; saved?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const tours = (await listTours()).filter((t) => t.is_active === 1);
  const tourId = params.tourId && tours.some((t) => t.id === params.tourId) ? params.tourId : (tours[0]?.id ?? "");
  const templates = tourId ? await listSessionTemplates(tourId) : [];

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Weekly schedule</h1>
        <p>
          Which days and times this tour runs, and the default seats. Adding a slot creates its departures 120 days
          ahead. Changes only affect empty departures — ones with bookings are never moved (close those from{" "}
          <Link href={`/dashboard/availability?tourId=${tourId}`}>Availability</Link> if you need to).
        </p>
      </div>

      {params.saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> {SAVED[params.saved] ?? "Saved."}
        </div>
      )}
      {params.error && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{ERRORS[params.error] ?? "Something went wrong."}</p>
        </div>
      )}

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <form method="get" className="pr-dash-actions" style={{ margin: 0 }}>
          <select name="tourId" defaultValue={tourId} style={{ width: "auto" }}>
            {tours.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">Show</button>
        </form>
      </div>

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>Add a slot</h2>
        <form action={addScheduleSlot} className="pr-dash-actions">
          <input type="hidden" name="tourId" value={tourId} />
          <label className="pr-dash-field" style={{ maxWidth: "160px" }}>
            Day
            <select name="weekday" defaultValue="1">
              {WEEKDAYS.map((w, i) => (
                <option key={i} value={i}>{w}</option>
              ))}
            </select>
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "130px" }}>
            Time
            <input type="time" name="start_time" defaultValue="09:00" required />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "110px" }}>
            Seats
            <input type="number" name="capacity" min={1} defaultValue={24} required />
          </label>
          <button type="submit" className="pr-dash-btn">Add slot</button>
        </form>
      </div>

      <div className="pr-dash-card">
        <h2>Current schedule</h2>
        {templates.length === 0 ? (
          <div className="pr-dash-empty">No weekly slots yet. Add one above to start generating departures.</div>
        ) : (
          <div className="pr-avail-audit">
            {templates.map((t) => (
              <div key={t.id} className="pr-avail-row">
                <span className="pr-avail-row-time" style={{ minWidth: "96px" }}>{WEEKDAYS[t.weekday]}</span>
                <span className="pr-avail-row-time">{t.start_time}</span>
                <span className={"pr-dash-badge " + (t.is_active ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                  {t.is_active ? "Running" : "Paused"}
                </span>
                <div className="pr-avail-row-actions">
                  <form action={updateScheduleSlot.bind(null, t.id)} className="pr-dash-actions">
                    <label className="pr-dash-field" style={{ maxWidth: "96px", flexDirection: "row", alignItems: "center", gap: "6px" }}>
                      Seats
                      <input type="number" name="capacity" min={1} defaultValue={t.capacity} key={t.capacity} style={{ width: "64px" }} />
                    </label>
                    <label className="pr-dash-check">
                      <input type="checkbox" name="is_active" defaultChecked={t.is_active === 1} /> Running
                    </label>
                    <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">Save</button>
                  </form>
                  <form action={deleteScheduleSlot.bind(null, t.id)}>
                    <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
