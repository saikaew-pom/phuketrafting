import Link from "next/link";
import { listTours } from "@/lib/queries/tours";
import { listTourSessionsForAdmin, type AdminTourSession } from "@/lib/scheduling";
import { bangkokTodayISO } from "@/lib/format";
import { monthMeta, isValidMonth, monthOf, dayISO, longDateLabel, WEEKDAY_LABELS } from "@/lib/calendar";
import { setSessionBlocked, setSessionCapacity, generateNow } from "./actions";

// The four departure states drive the chip colour AND the legend, so they're
// defined once. "full" folds in the sold-out and (defensive) zero-sellable
// cases; "filling" is the 80%+ warning band that tells staff to consider an
// extra departure.
type DepState = "open" | "filling" | "full" | "closed";
function depState(s: AdminTourSession): DepState {
  const sellable = s.capacity - s.allotment_hold;
  if (s.is_blocked) return "closed";
  if (sellable <= 0 || s.booked_count >= sellable) return "full";
  if (s.booked_count / sellable >= 0.8) return "filling";
  return "open";
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ tourId?: string; month?: string; day?: string }>;
}) {
  const params = await searchParams;
  const tours = await listTours();
  const activeTours = tours.filter((t) => t.is_active === 1);

  const tourId =
    params.tourId && activeTours.some((t) => t.id === params.tourId)
      ? params.tourId
      : (activeTours[0]?.id ?? "");
  const tourName = activeTours.find((t) => t.id === tourId)?.name ?? "";

  const today = bangkokTodayISO();
  const month = params.month && isValidMonth(params.month) ? params.month : monthOf(today);
  const meta = monthMeta(month);
  // A ?day= is only honoured if it's inside the month being shown -- a stale
  // link from another month shouldn't open a panel for a day not on screen.
  const selectedDay =
    params.day && monthOf(params.day) === month && params.day >= meta.firstISO && params.day <= meta.lastISO
      ? params.day
      : null;

  const sessions = tourId ? await listTourSessionsForAdmin(tourId, meta.firstISO, meta.lastISO) : [];

  // Group departures by date once; the grid and the day panel both read it.
  const byDate = new Map<string, AdminTourSession[]>();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  // Month summary (the "shape" strip).
  let closed = 0;
  let nearlyFull = 0;
  let sumBooked = 0;
  let sumSellable = 0;
  for (const s of sessions) {
    const st = depState(s);
    if (st === "closed") closed++;
    else {
      const sellable = Math.max(0, s.capacity - s.allotment_hold);
      sumBooked += s.booked_count;
      sumSellable += sellable;
      if (st === "filling" || st === "full") nearlyFull++;
    }
  }
  const occupancy = sumSellable > 0 ? Math.round((sumBooked / sumSellable) * 100) : 0;

  const base = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ tourId, month, ...extra });
    return `/dashboard/availability?${q.toString()}`;
  };

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Availability</h1>
        <form action={generateNow}>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">Generate departures</button>
        </form>
        <p>Pick a tour and month. Each day shows its departures, coloured by how full they are. Click a day to manage it.</p>
      </div>

      {/* Toolbar: tour switcher (GET form) + month nav (links) */}
      <div className="pr-dash-card pr-avail-toolbar">
        <form method="get" className="pr-dash-actions" style={{ margin: 0 }}>
          <input type="hidden" name="month" value={month} />
          <select name="tourId" defaultValue={tourId} style={{ width: "auto" }}>
            {activeTours.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">Show</button>
        </form>
        <div className="pr-avail-monthnav">
          <Link href={base({ month: meta.prevMonth })} className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" aria-label="Previous month">‹</Link>
          <span className="pr-avail-monthlabel">{meta.label}</span>
          <Link href={base({ month: meta.nextMonth })} className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" aria-label="Next month">›</Link>
        </div>
      </div>

      {/* Summary strip */}
      <div className="pr-avail-summary">
        <div className="pr-avail-stat"><span className="pr-avail-stat-lbl">Departures</span><span className="pr-avail-stat-val">{sessions.length}</span></div>
        <div className="pr-avail-stat"><span className="pr-avail-stat-lbl">Closed</span><span className="pr-avail-stat-val" style={{ color: closed > 0 ? "var(--accent-dark)" : undefined }}>{closed}</span></div>
        <div className="pr-avail-stat"><span className="pr-avail-stat-lbl">Avg occupancy</span><span className="pr-avail-stat-val">{occupancy}%</span></div>
        <div className="pr-avail-stat"><span className="pr-avail-stat-lbl">Nearly full</span><span className="pr-avail-stat-val">{nearlyFull}</span></div>
      </div>

      {sessions.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">
            No departures for {tourName} in {meta.label}.
            <br />
            If this is a new setup, press &quot;Generate departures&quot; above.
          </div>
        </div>
      ) : (
        <>
          <div className="pr-avail-grid pr-avail-grid-head">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="pr-avail-wd">{w}</div>
            ))}
          </div>
          <div className="pr-avail-grid">
            {Array.from({ length: meta.leadingBlanks }).map((_, i) => (
              <div key={`b${i}`} className="pr-avail-cell pr-avail-cell-empty" />
            ))}
            {Array.from({ length: meta.daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = dayISO(month, day);
              const deps = byDate.get(date) ?? [];
              const allClosed = deps.length > 0 && deps.every((s) => s.is_blocked);
              const isToday = date === today;
              const isSelected = date === selectedDay;
              return (
                <Link
                  key={date}
                  href={base({ day: date })}
                  className={
                    "pr-avail-cell" +
                    (allClosed ? " pr-avail-cell-closed" : "") +
                    (isToday ? " pr-avail-cell-today" : "") +
                    (isSelected ? " pr-avail-cell-selected" : "")
                  }
                >
                  <span className="pr-avail-daynum">{day}</span>
                  {deps.map((s) => {
                    const st = depState(s);
                    const sellable = Math.max(0, s.capacity - s.allotment_hold);
                    return (
                      <span key={s.id} className={"pr-avail-chip pr-avail-chip-" + st}>
                        {st === "closed" ? "closed" : `${s.start_time} ${s.booked_count}/${sellable}`}
                      </span>
                    );
                  })}
                </Link>
              );
            })}
          </div>

          <div className="pr-avail-legend">
            <span><span className="pr-avail-dot pr-avail-chip-open" /> open</span>
            <span><span className="pr-avail-dot pr-avail-chip-filling" /> filling</span>
            <span><span className="pr-avail-dot pr-avail-chip-full" /> full</span>
            <span><span className="pr-avail-dot pr-avail-chip-closed" /> closed</span>
          </div>

          {selectedDay && <DayPanel date={selectedDay} deps={byDate.get(selectedDay) ?? []} />}
        </>
      )}

      <p className="pr-dash-field-hint" style={{ marginTop: "20px" }}>
        Departures are created automatically each morning from the weekly schedule. The schedule itself (which days and
        times run) isn&apos;t editable here yet.
      </p>
    </div>
  );
}

/**
 * The manage-one-day panel: each departure's capacity + close/reopen. Reuses
 * the same guarded server actions as before -- this is a layout change, not a
 * behaviour change.
 */
function DayPanel({ date, deps }: { date: string; deps: AdminTourSession[] }) {
  if (deps.length === 0) {
    return (
      <div className="pr-dash-card" style={{ marginTop: "16px" }}>
        <h2>{longDateLabel(date)}</h2>
        <div className="pr-dash-empty">No departures on this day.</div>
      </div>
    );
  }
  return (
    <div className="pr-dash-card" style={{ marginTop: "16px" }}>
      <h2>{longDateLabel(date)}</h2>
      {deps.map((s) => {
        const sellable = Math.max(0, s.capacity - s.allotment_hold);
        const st = depState(s);
        return (
          <div key={s.id} className="pr-avail-row">
            <span className="pr-avail-row-time">{s.start_time}</span>
            <span className={"pr-dash-badge " + (st === "closed" ? "pr-dash-badge-danger" : st === "full" ? "pr-dash-badge-warn" : "pr-dash-badge-ok")}>
              {st === "closed" ? "Closed" : st === "full" ? "Full" : "Open"}
            </span>
            <span className="pr-avail-row-booked">
              {s.booked_count} / {sellable} booked
              {s.allotment_hold > 0 && <span className="pr-dash-field-hint"> ({s.allotment_hold} held for agents)</span>}
              {/* === 1, not just `s.is_blocked &&`: is_blocked is 0/1 (a number),
                  and `0 && x` renders a literal "0" in JSX. */}
              {s.is_blocked === 1 && s.block_reason && <span className="pr-dash-field-hint"> — {s.block_reason}</span>}
            </span>
            <div className="pr-avail-row-actions">
              {/* Capacity -- min mirrors the server guard (can't cut below sold+held). */}
              <form action={setSessionCapacity.bind(null, s.id)} className="pr-dash-actions">
                <input
                  type="number"
                  name="capacity"
                  min={s.booked_count + s.allotment_hold}
                  defaultValue={s.capacity}
                  key={s.capacity}
                  aria-label="Seats"
                  style={{ width: "72px" }}
                />
                <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">Set seats</button>
              </form>
              {s.is_blocked ? (
                <form action={setSessionBlocked.bind(null, s.id, false)}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">Reopen</button>
                </form>
              ) : (
                <form action={setSessionBlocked.bind(null, s.id, true)} className="pr-dash-actions">
                  <input name="block_reason" placeholder="Reason, e.g. river too high" required style={{ width: "180px" }} />
                  <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">Close</button>
                </form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
