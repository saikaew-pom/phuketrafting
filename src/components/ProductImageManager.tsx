import { listImages, type ImageOwnerType } from "@/lib/queries/images";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { ImageUploadField } from "@/components/ImageUploadField";
import { addProductImage, removeProductImage, moveProductImage } from "@/app/dashboard/products/image-actions";

/**
 * Reusable "additional images" manager for a tour or camp zone (F4 / #8).
 * The cover is edited separately on the same page (cover_image_id); this holds
 * the supplementary set. Server component -- each row is its own form bound to
 * the shared image-actions with this product's owner type + id.
 */
export async function ProductImageManager({ ownerType, ownerId }: { ownerType: ImageOwnerType; ownerId: string }) {
  const images = await listImages(ownerType, ownerId);
  const add = addProductImage.bind(null, ownerType, ownerId);

  return (
    <div className="pr-dash-card" style={{ marginTop: "16px" }}>
      <h2>More photos</h2>
      <p className="pr-dash-field-hint" style={{ marginBottom: "12px" }}>
        Extra photos beyond the cover above. (The cover is what shows on the home-page card today; these are stored for
        the product gallery.)
      </p>

      <form action={add} className="pr-dash-form" style={{ marginBottom: "12px" }}>
        <ImageUploadField name="image_id" initialPublicId={null} label="Add a photo" />
        <label className="pr-dash-field">
          Caption
          <input name="label" maxLength={120} placeholder="e.g. Class III rapids" />
        </label>
        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost">
            Add photo
          </button>
        </div>
      </form>

      {images.length > 0 && (
        <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
          <table className="pr-dash-table">
            <tbody>
              {images.map((img, i) => (
                <tr key={img.id}>
                  <td style={{ width: "96px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dashboard thumbnail */}
                    <img
                      src={cloudinaryUrl(img.image_id, 120)}
                      alt={img.label ?? ""}
                      style={{ width: "80px", height: "56px", objectFit: "cover", borderRadius: "6px" }}
                    />
                  </td>
                  <td>{img.label || <span className="pr-dash-field-hint">(no caption)</span>}</td>
                  <td style={{ width: "120px" }}>
                    <div className="pr-dash-actions">
                      <form action={moveProductImage.bind(null, ownerType, ownerId, img.id, "up")}>
                        <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>
                          ↑
                        </button>
                      </form>
                      <form action={moveProductImage.bind(null, ownerType, ownerId, img.id, "down")}>
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
                  <td style={{ width: "100px" }}>
                    <form action={removeProductImage.bind(null, ownerType, ownerId, img.id)}>
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
      )}
    </div>
  );
}
