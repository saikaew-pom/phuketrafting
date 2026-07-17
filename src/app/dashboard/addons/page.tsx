import { requireStaff } from "@/lib/access";
import { listAllAddons } from "@/lib/queries/addons";
import { addAddon, saveAddon, removeAddon, moveAddonAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  name_required: "Give the add-on a name.",
  bad_price: "Enter a price (0 or more) -- leaving it blank isn't allowed.",
  has_bookings: "A guest has already bought this add-on, so it can't be deleted. Untick “Offered” to retire it instead.",
};

/**
 * Priced add-ons catalog (migration 0018). One global list; each add-on is a
 * flat price a guest can tick on any tour or camp booking, added once to the
 * total (and so to the deposit). Order here is the order they show in the
 * booking widget; unticking "Offered" hides one without deleting its history.
 */
export default async function AddonsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireStaff();
  const { error, saved } = await searchParams;
  const addons = await listAllAddons();
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Add-ons</h1>
        <p>Extras a guest can tick when booking any tour or camp -- each adds its price once to the booking total. Order here is the order shown.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Add-ons updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <div className="pr-dash-card">
        <h2>New add-on</h2>
        <form action={addAddon} className="pr-dash-form">
          <label className="pr-dash-field">
            Name
            <input name="name" required maxLength={120} placeholder="e.g. GoPro rental" />
          </label>
          <label className="pr-dash-field">
            Description (optional)
            <textarea name="description" rows={2} maxLength={500} placeholder="Shown under the name in the booking widget." />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "180px" }}>
            Price (฿)
            <input type="number" name="price" min="0" step="1" required />
          </label>
          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn">Add add-on</button>
          </div>
        </form>
      </div>

      {addons.map((a, i) => (
        <div className="pr-dash-card" style={{ marginTop: "16px" }} key={a.id}>
          <form action={saveAddon.bind(null, a.id)} className="pr-dash-form">
            <label className="pr-dash-field">
              Name
              <input name="name" defaultValue={a.name} required maxLength={120} />
            </label>
            <label className="pr-dash-field">
              Description (optional)
              <textarea name="description" defaultValue={a.description ?? ""} rows={2} maxLength={500} />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "180px" }}>
              Price (฿)
              <input type="number" name="price" defaultValue={a.price} min="0" step="1" required />
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="is_active" defaultChecked={a.is_active === 1} /> Offered when booking
            </label>
            <div className="pr-dash-actions">
              <button type="submit" className="pr-dash-btn">Save</button>
            </div>
          </form>
          {/* Move/delete are their own forms -- separate from the save form (no nested forms). */}
          <div className="pr-dash-actions" style={{ marginTop: "8px" }}>
            <form action={moveAddonAction.bind(null, a.id, "up")}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>↑ Up</button>
            </form>
            <form action={moveAddonAction.bind(null, a.id, "down")}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === addons.length - 1}>↓ Down</button>
            </form>
            <form action={removeAddon.bind(null, a.id)}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">Delete</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
