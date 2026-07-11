import { notFound } from "next/navigation";
import { getCampZone, getCampRates } from "@/lib/queries/camping";
import { saveCampZone } from "../actions";

export default async function CampZoneEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await getCampZone(id);
  if (!zone) notFound();

  const rates = await getCampRates(id);
  const saveZoneWithId = saveCampZone.bind(null, id);

  return (
    <div>
      <h1>{zone.name}</h1>
      <form action={saveZoneWithId} style={{ maxWidth: "560px", display: "grid", gap: "12px" }}>
        <label>
          Name
          <input name="name" defaultValue={zone.name} required style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Tagline
          <input name="tagline" defaultValue={zone.tagline ?? ""} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={zone.description ?? ""}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          <input type="checkbox" name="is_active" defaultChecked={zone.is_active === 1} /> Active (visible on site)
        </label>

        <h2>Stay packages (THB / night)</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: "4px 12px 4px 0" }}>Package</th>
              <th style={{ padding: "4px 12px" }}>Weekday</th>
              <th style={{ padding: "4px 12px" }}>Weekend</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id}>
                <td style={{ padding: "4px 12px 4px 0" }}>{rate.stay_type}</td>
                <td style={{ padding: "4px 12px" }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    name={`rate-weekday-${rate.id}`}
                    defaultValue={rate.price_weekday}
                    style={{ width: "100px" }}
                  />
                </td>
                <td style={{ padding: "4px 12px" }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    name={`rate-weekend-${rate.id}`}
                    defaultValue={rate.price_weekend}
                    style={{ width: "100px" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="submit" style={{ padding: "8px 16px", marginTop: "8px", width: "fit-content" }}>
          Save
        </button>
      </form>
    </div>
  );
}
