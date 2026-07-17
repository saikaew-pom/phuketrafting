import { requireStaff } from "@/lib/access";
import { listImages } from "@/lib/queries/images";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { ImageUploadField } from "@/components/ImageUploadField";
import { addGalleryImage, removeGalleryImage, moveGalleryImage } from "./actions";

/**
 * The homepage gallery, dashboard-managed (F4 / audit #6). While this list is
 * empty the public page falls back to the hardcoded launch set, so adding the
 * first image here quietly takes over the section.
 */
export default async function GalleryPage() {
  await requireStaff();
  const images = await listImages("gallery", null);

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Gallery</h1>
        <p>
          The photo strip on the home page (&quot;Straight from the river&quot;). Order here is the order shown.
          {images.length === 0 && " Until you add one, the site shows the original launch photos."}
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Add a photo</h2>
        <form action={addGalleryImage} className="pr-dash-form">
          <ImageUploadField name="image_id" initialPublicId={null} label="Photo" />
          <label className="pr-dash-field">
            Caption
            <input name="label" maxLength={120} placeholder="e.g. White-water rafting" />
            <span className="pr-dash-field-hint">Shown on hover and read by screen readers.</span>
          </label>
          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn">
              Add to gallery
            </button>
          </div>
        </form>
      </div>

      {images.length > 0 && (
        <div className="pr-dash-card" style={{ marginTop: "16px" }}>
          <h2>{images.length} photo{images.length === 1 ? "" : "s"}</h2>
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Caption</th>
                  <th>Order</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {images.map((img, i) => (
                  <tr key={img.id}>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element -- dashboard thumbnail, not a public LCP image */}
                      <img
                        src={cloudinaryUrl(img.image_id, 120)}
                        alt={img.label ?? ""}
                        style={{ width: "80px", height: "56px", objectFit: "cover", borderRadius: "6px" }}
                      />
                    </td>
                    <td>{img.label || <span className="pr-dash-field-hint">(no caption)</span>}</td>
                    <td>
                      <div className="pr-dash-actions">
                        <form action={moveGalleryImage.bind(null, img.id, "up")}>
                          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>
                            ↑
                          </button>
                        </form>
                        <form action={moveGalleryImage.bind(null, img.id, "down")}>
                          <button
                            type="submit"
                            className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
                            disabled={i === images.length - 1}
                          >
                            ↓
                          </button>
                        </form>
                      </div>
                    </td>
                    <td>
                      <form action={removeGalleryImage.bind(null, img.id)}>
                        <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
