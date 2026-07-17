import { notFound } from "next/navigation";
import { getTour, getTourRates, parseIncludes } from "@/lib/queries/tours";
import { saveTour } from "../actions";
import { ImageUploadField } from "@/components/ImageUploadField";

// saveTour redirects here with ?error=<code> on an expected mistake or ?saved=1
// on success, instead of throwing an error production would redact. (Audit A14.)
const TOUR_ERROR_MESSAGES: Record<string, string> = {
  name_required: "Name is required.",
  min_max: "Minimum group size can't be larger than the maximum.",
  blank_price: "Prices can't be blank -- enter 0 only if the tour really is free.",
  invalid_number: "Please check the numbers (prices, distance, group size, sort order).",
};

export default async function TourEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const tour = await getTour(id);
  if (!tour) notFound();

  const rates = await getTourRates(id);
  const saveTourWithId = saveTour.bind(null, id);
  const errorMessage = error ? (TOUR_ERROR_MESSAGES[error] ?? "Something went wrong saving the tour.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>{tour.name}</h1>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Tour updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      )}
      <form action={saveTourWithId} className="pr-dash-form">
        <div className="pr-dash-card">
          <h2>Basics</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-field">
              Name
              <input name="name" defaultValue={tour.name} required />
            </label>
            <label className="pr-dash-field">
              Tagline
              <input name="tagline" defaultValue={tour.tagline ?? ""} />
            </label>
            <label className="pr-dash-field">
              Description
              <textarea name="description" rows={3} defaultValue={tour.description ?? ""} />
            </label>
            <label className="pr-dash-field">
              Badge
              <input name="badge" defaultValue={tour.badge ?? ""} />
              <span className="pr-dash-field-hint">Small label on the tour card, e.g. &quot;Bestseller&quot;. Leave blank for none.</span>
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="is_active" defaultChecked={tour.is_active === 1} /> Active (visible on site)
            </label>
            <ImageUploadField name="cover_image_id" initialPublicId={tour.cover_image_id} label="Cover image" />
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Trip details</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-field">
              Distance (km)
              <input type="number" step="0.1" min="0" name="distance_km" defaultValue={tour.distance_km ?? ""} />
            </label>
            <label className="pr-dash-field">
              Duration label
              <input name="duration_label" defaultValue={tour.duration_label ?? ""} placeholder="e.g. ~4 hrs" />
            </label>
            <label className="pr-dash-field">
              Min group size
              <input type="number" step="1" min="0" name="min_group" defaultValue={tour.min_group ?? ""} />
            </label>
            <label className="pr-dash-field">
              Max group size
              <input type="number" step="1" min="0" name="max_group" defaultValue={tour.max_group ?? ""} />
            </label>
            <label className="pr-dash-field">
              What&apos;s included (one per line)
              <textarea name="includes" rows={5} defaultValue={parseIncludes(tour.includes).join("\n")} />
              <span className="pr-dash-field-hint">These are the bullet points on the tour card. One item per line.</span>
            </label>
            <label className="pr-dash-field">
              Sort order
              <input type="number" step="1" min="0" name="sort_order" defaultValue={tour.sort_order} />
              <span className="pr-dash-field-hint">Lower numbers show first.</span>
            </label>
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Pricing (THB)</h2>
          <div className="pr-dash-form">
            {rates.map((rate) => (
              <label key={rate.id} className="pr-dash-field">
                {rate.label ?? `Age ${rate.min_age}+`}
                {/* required for the same reason the camping rate inputs carry it:
                    saveTour rejects a blank price by THROWING (a blank must never
                    coerce to 0 -- Number("") is 0, which once made a tour FREE),
                    and Next.js redacts Server Action error messages in production,
                    so a staff member clearing a price to retype it would get an
                    opaque "Reference: NNNN" instead of the reason. min="0" does
                    NOT cover this -- HTML skips constraint validation on empty
                    values. (Audit A6.) */}
                <input type="number" step="1" min="0" required name={`rate-${rate.id}`} defaultValue={rate.price} />
              </label>
            ))}
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
