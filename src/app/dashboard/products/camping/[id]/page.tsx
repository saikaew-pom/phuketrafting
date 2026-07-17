import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampZone, getCampRates, listCampUnits } from "@/lib/queries/camping";
import { saveCampZone, addCampUnit, saveCampUnit, toggleCampUnitBlocked, removeCampUnit } from "../actions";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ProductImageManager } from "@/components/ProductImageManager";

export default async function CampZoneEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await getCampZone(id);
  if (!zone) notFound();

  const [rates, units] = await Promise.all([getCampRates(id), listCampUnits(id)]);
  const saveZoneWithId = saveCampZone.bind(null, id);
  const addUnitToZone = addCampUnit.bind(null, id);
  const bookableCount = units.filter((u) => u.is_active === 1 && u.is_blocked === 0).length;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>{zone.name}</h1>
      </div>
      <form action={saveZoneWithId} className="pr-dash-form">
        <div className="pr-dash-card">
          <h2>Basics</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-field">
              Name
              <input name="name" defaultValue={zone.name} required />
            </label>
            <label className="pr-dash-field">
              Tagline
              <input name="tagline" defaultValue={zone.tagline ?? ""} />
            </label>
            <label className="pr-dash-field">
              Description
              <textarea name="description" rows={3} defaultValue={zone.description ?? ""} />
            </label>
            <label className="pr-dash-field">
              Sleeps
              <input name="sleeps_label" defaultValue={zone.sleeps_label ?? ""} placeholder="e.g. 2-4 guests" />
              <span className="pr-dash-field-hint">Shown to the chatbot and used in blog facts.</span>
            </label>
            <label className="pr-dash-field">
              Sort order
              <input type="number" step="1" min="0" name="sort_order" defaultValue={zone.sort_order} />
              <span className="pr-dash-field-hint">Lower numbers show first.</span>
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="is_active" defaultChecked={zone.is_active === 1} /> Active (visible on site)
            </label>
            <ImageUploadField name="cover_image_id" initialPublicId={zone.cover_image_id} label="Cover image" />
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Stay packages (THB / night)</h2>
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Weekday</th>
                  <th>Weekend</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.stay_type}</td>
                    <td>
                      {/* required for the same reason as block_reason below:
                          saveCampZone rejects a blank price by THROWING (a
                          blank must never coerce to 0 -- Number("") is 0, and
                          that once made a stay free), and Next.js redacts
                          Server Action error messages in production. Clearing a
                          price to retype it is normal use, so without this the
                          staff member gets an opaque digest instead of "Prices
                          can't be blank". min="0" does NOT cover this: HTML
                          constraint validation skips empty values entirely. */}
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        name={`rate-weekday-${rate.id}`}
                        defaultValue={rate.price_weekday}
                        style={{ width: "110px" }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        name={`rate-weekend-${rate.id}`}
                        defaultValue={rate.price_weekend}
                        style={{ width: "110px" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">
            Save
          </button>
        </div>
      </form>

      {/* Outside the zone <form> above -- each unit row is its own form, and
          HTML forbids nesting one form inside another (the browser drops the
          inner one, so every unit button would silently submit the zone save
          instead). */}
      <div className="pr-dash-card" style={{ marginTop: "16px" }}>
        <h2>Tents in this zone</h2>
        <p className="pr-dash-field-hint" style={{ marginBottom: "12px" }}>
          These are the physical tents guests book. A zone with no bookable tents can&apos;t be sold at all, however
          good its photos and prices are. A tent is offered on a date when it&apos;s active, not out of service, and
          nobody else is staying in it &mdash; there are no seat counts here, only whether the tent is free.{" "}
          {units.length === 0 ? (
            <strong>This zone has no tents yet, so it is currently unbookable.</strong>
          ) : (
            <>
              {bookableCount} of {units.length} bookable right now.{" "}
              <Link href="/dashboard/availability/camping">See the calendar</Link>.
            </>
          )}
        </p>

        {units.length > 0 && (
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th>Tent</th>
                  <th>Sleeps</th>
                  <th>Active</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td colSpan={3}>
                      <form action={saveCampUnit.bind(null, id, unit.id)} className="pr-dash-actions">
                        <input name="name" defaultValue={unit.name} required style={{ width: "160px" }} />
                        {/* required: parseOccupancy rejects a blank by throwing
                            (Number("") is 0 -- an occupancy-0 tent is real-
                            looking inventory sold to nobody), and production
                            redacts that message. min={1} does not catch it --
                            HTML skips constraint validation on empty values, so
                            the browser happily submits "". */}
                        <input
                          type="number"
                          name="occupancy"
                          min={1}
                          step={1}
                          required
                          defaultValue={unit.occupancy}
                          style={{ width: "80px" }}
                        />
                        <label className="pr-dash-check" style={{ margin: 0 }}>
                          <input type="checkbox" name="is_active" defaultChecked={unit.is_active === 1} /> Active
                        </label>
                        <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                          Save
                        </button>
                      </form>
                    </td>
                    <td>
                      {unit.is_blocked ? (
                        <span className="pr-dash-badge pr-dash-badge-danger">Out of service</span>
                      ) : unit.is_active ? (
                        <span className="pr-dash-badge pr-dash-badge-ok">Bookable</span>
                      ) : (
                        <span className="pr-dash-badge pr-dash-badge-warn">Hidden</span>
                      )}
                    </td>
                    <td>{unit.is_blocked ? (unit.block_reason ?? "--") : ""}</td>
                    <td>
                      <div className="pr-dash-actions">
                        {unit.is_blocked ? (
                          <form action={toggleCampUnitBlocked.bind(null, id, unit.id, false)}>
                            <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                              Back in service
                            </button>
                          </form>
                        ) : (
                          <form action={toggleCampUnitBlocked.bind(null, id, unit.id, true)} className="pr-dash-actions">
                            {/* required: the action rejects a blank reason by
                                throwing, whose message production redacts. */}
                            <input
                              name="block_reason"
                              placeholder="Reason, e.g. zip broken"
                              required
                              style={{ width: "150px" }}
                            />
                            <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">
                              Take out
                            </button>
                          </form>
                        )}
                        {/* No Delete button once a tent has bookings, rather
                            than a button that always fails. removeCampUnit
                            refuses it server-side -- but refusing means
                            THROWING, and Next.js redacts Server Action error
                            messages in production, so staff would get an
                            opaque "That didn't work / Reference: 3418642987"
                            instead of the reason. Mirrors deleteCampUnit's
                            guard exactly (ANY booking, any status); the server
                            guard stays as the real boundary. Same fix as the
                            capacity floor on the departures calendar. */}
                        {unit.booking_count === 0 ? (
                          <form action={removeCampUnit.bind(null, id, unit.id)}>
                            <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                              Delete
                            </button>
                          </form>
                        ) : (
                          <span className="pr-dash-field-hint">
                            {unit.booking_count} booking{unit.booking_count === 1 ? "" : "s"}
                            {" — untick Active to retire"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={addUnitToZone} className="pr-dash-actions" style={{ marginTop: "12px" }}>
          <input name="name" placeholder="Tent name, e.g. Riverside 4" required style={{ width: "200px" }} />
          {/* required: same blank-occupancy throw as the edit row above. */}
          <input type="number" name="occupancy" min={1} step={1} required defaultValue={2} style={{ width: "80px" }} />
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Add tent
          </button>
        </form>
      </div>

      <ProductImageManager ownerType="camp_zone" ownerId={id} />
    </div>
  );
}
