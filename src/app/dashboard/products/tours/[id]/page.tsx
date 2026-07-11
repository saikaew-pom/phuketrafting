import { notFound } from "next/navigation";
import { getTour, getTourRates } from "@/lib/queries/tours";
import { saveTour } from "../actions";
import { ImageUploadField } from "@/components/ImageUploadField";

export default async function TourEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tour = await getTour(id);
  if (!tour) notFound();

  const rates = await getTourRates(id);
  const saveTourWithId = saveTour.bind(null, id);

  return (
    <div>
      <h1>{tour.name}</h1>
      <form action={saveTourWithId} style={{ maxWidth: "480px", display: "grid", gap: "12px" }}>
        <label>
          Name
          <input name="name" defaultValue={tour.name} required style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Tagline
          <input name="tagline" defaultValue={tour.tagline ?? ""} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={tour.description ?? ""}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Badge
          <input name="badge" defaultValue={tour.badge ?? ""} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          <input type="checkbox" name="is_active" defaultChecked={tour.is_active === 1} /> Active (visible on site)
        </label>
        <ImageUploadField name="cover_image_id" initialPublicId={tour.cover_image_id} label="Cover image" />

        <h2>Pricing (THB)</h2>
        {rates.map((rate) => (
          <label key={rate.id}>
            {rate.label}
            <input
              type="number"
              step="1"
              min="0"
              name={`rate-${rate.id}`}
              defaultValue={rate.price}
              style={{ display: "block", width: "100%" }}
            />
          </label>
        ))}

        <button type="submit" style={{ padding: "8px 16px", marginTop: "8px" }}>
          Save
        </button>
      </form>
    </div>
  );
}
