import { requireStaff } from "@/lib/access";
import { listTagsWithCounts } from "@/lib/queries/tags";
import { addTagAction, renameTagAction, removeTagAction, moveTagAction } from "./actions";
import { DeleteTagButton } from "./DeleteTagButton";

const ERRORS: Record<string, string> = {
  name_required: "Give the tag a name.",
  name_too_long: "Tag name is too long (max 40 characters).",
};

/**
 * Staff-managed tags, used today to organize gallery photos (each photo can
 * carry several). Deleting a tag here untags every photo that had it --
 * nothing blocks it, unlike a tour category still in use.
 */
export default async function TagsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireStaff();
  const { error, saved } = await searchParams;
  const tags = await listTagsWithCounts();
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Tags</h1>
        <p>Labels for organizing gallery photos. Assign them to photos from the Gallery screen.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Tags updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      )}

      <div className="pr-dash-card" style={{ marginBottom: "16px" }}>
        <h2>New tag</h2>
        <form action={addTagAction} className="pr-dash-actions">
          <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
            Name
            <input name="name" required maxLength={40} placeholder="e.g. Rafting" />
          </label>
          <button type="submit" className="pr-dash-btn">
            Create tag
          </button>
        </form>
      </div>

      {tags.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">No tags yet. Add one above.</div>
        </div>
      ) : (
        <div className="pr-dash-card">
          <div className="pr-dash-tablewrap" style={{ boxShadow: "none" }}>
            <table className="pr-dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Used on</th>
                  <th>Order</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag, i) => (
                  <tr key={tag.id}>
                    <td>
                      <form action={renameTagAction.bind(null, tag.id)} className="pr-dash-actions">
                        <input name="name" defaultValue={tag.name} required maxLength={40} style={{ maxWidth: "200px" }} />
                        <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                          Rename
                        </button>
                      </form>
                    </td>
                    <td>
                      <span className="pr-dash-field-hint">
                        {tag.usageCount} photo{tag.usageCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td>
                      <div className="pr-dash-actions">
                        <form action={moveTagAction.bind(null, tag.id, "up")}>
                          <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>
                            ↑
                          </button>
                        </form>
                        <form action={moveTagAction.bind(null, tag.id, "down")}>
                          <button
                            type="submit"
                            className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
                            disabled={i === tags.length - 1}
                          >
                            ↓
                          </button>
                        </form>
                      </div>
                    </td>
                    <td>
                      <DeleteTagButton
                        tagName={tag.name}
                        usageCount={tag.usageCount}
                        onDelete={removeTagAction.bind(null, tag.id)}
                      />
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
