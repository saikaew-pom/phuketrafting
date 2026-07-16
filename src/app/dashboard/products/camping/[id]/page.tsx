import { notFound } from "next/navigation";
import { getCampZone, getCampRates } from "@/lib/queries/camping";
import { saveCampZone } from "../actions";
import { ImageUploadField } from "@/components/ImageUploadField";

export default async function CampZoneEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await getCampZone(id);
  if (!zone) notFound();

  const rates = await getCampRates(id);
  const saveZoneWithId = saveCampZone.bind(null, id);

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
                      <input
                        type="number"
                        step="1"
                        min="0"
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
    </div>
  );
}
