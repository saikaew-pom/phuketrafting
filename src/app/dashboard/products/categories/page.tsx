import Link from "next/link";
import { requireStaff } from "@/lib/access";
import { listTourCategories } from "@/lib/queries/tour-categories";
import { listTours } from "@/lib/queries/tours";
import { ImageUploadField } from "@/components/ImageUploadField";
import { addCategory, saveCategory, removeCategory, moveCategoryAction } from "./actions";

const ERRORS: Record<string, string> = {
  name_required: "Give the category a name.",
  has_tours: "This category still has tours in it. Move them to another category first (on each tour's page), then delete.",
};

/** Tour categories -- the homepage groupings. New tour TYPES become a category
 * here, then tours are assigned to it on their own page. */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireStaff();
  const { error, saved } = await searchParams;
  const [categories, tours] = await Promise.all([listTourCategories(), listTours()]);
  const countByCat = new Map<string, number>();
  for (const t of tours) {
    if (t.category_id) countByCat.set(t.category_id, (countByCat.get(t.category_id) ?? 0) + 1);
  }
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Tour categories</h1>
        <p>The groups tours are shown under on the homepage. Add a category for a new kind of tour (e.g. Island Tours, Trekking), then assign tours to it from each tour&apos;s page.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Categories updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>New category</h2>
        <form action={addCategory} className="pr-dash-actions">
          <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
            Name
            <input name="name" required maxLength={80} placeholder="e.g. Island Tours" />
          </label>
          <label className="pr-dash-field" style={{ minWidth: "260px", flex: 1 }}>
            Tagline (optional)
            <input name="tagline" maxLength={200} placeholder="Short line under the section heading" />
          </label>
          <button type="submit" className="pr-dash-btn">Create category</button>
        </form>
      </div>

      {categories.length === 0 ? (
        <div className="pr-dash-card"><div className="pr-dash-empty">No categories yet. Add one above.</div></div>
      ) : (
        categories.map((c, i) => (
          <div className="pr-dash-card" style={{ marginTop: "16px" }} key={c.id}>
            {/* Header + reorder are OUTSIDE the save form (no nested forms). */}
            <div className="pr-dash-actions" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
              <h2 style={{ margin: 0 }}>
                {c.name}{" "}
                <span className="pr-dash-field-hint">
                  {countByCat.get(c.id) ?? 0} tour{(countByCat.get(c.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="pr-dash-actions">
                <form action={moveCategoryAction.bind(null, c.id, "up")}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>↑</button>
                </form>
                <form action={moveCategoryAction.bind(null, c.id, "down")}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === categories.length - 1}>↓</button>
                </form>
              </div>
            </div>
            <form action={saveCategory.bind(null, c.id)} className="pr-dash-form">
              <label className="pr-dash-field">
                Name
                <input name="name" defaultValue={c.name} required maxLength={80} />
              </label>
              <label className="pr-dash-field">
                Tagline
                <input name="tagline" defaultValue={c.tagline ?? ""} maxLength={200} />
              </label>
              <label className="pr-dash-check">
                <input type="checkbox" name="is_active" defaultChecked={c.is_active === 1} /> Shown on the homepage
              </label>
              <ImageUploadField name="cover_image_id" initialPublicId={c.cover_image_id} label="Section image (optional)" />
              <div className="pr-dash-actions" style={{ marginTop: "8px" }}>
                <button type="submit" className="pr-dash-btn">Save</button>
              </div>
            </form>
            {/* Delete is its own form (no nested forms). */}
            <form action={removeCategory.bind(null, c.id)} style={{ marginTop: "8px" }}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">Delete</button>
            </form>
          </div>
        ))
      )}

      <p className="pr-dash-field-hint" style={{ marginTop: "16px" }}>
        Assign tours to a category and choose which appear on the homepage from <Link href="/dashboard/products/tours">Tours</Link>.
      </p>
    </div>
  );
}
