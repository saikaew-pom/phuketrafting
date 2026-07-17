import { requireStaff } from "@/lib/access";
import { listAllFaqs } from "@/lib/queries/faqs";
import { addFaq, saveFaq, removeFaq, moveFaqAction } from "./actions";

/**
 * The landing-page FAQ, staff-editable (moved out of the hardcoded FAQS
 * constant, migration 0017). The public accordion and the FAQPage JSON-LD
 * both read these rows, so an edit here updates both.
 */
export default async function FaqsPage() {
  await requireStaff();
  const faqs = await listAllFaqs();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>FAQ</h1>
        <p>The questions on the home page. Order here is the order shown; unticking &quot;Shown&quot; hides one without deleting it.</p>
      </div>

      <div className="pr-dash-card">
        <h2>Add a question</h2>
        <form action={addFaq} className="pr-dash-form">
          <label className="pr-dash-field">
            Question
            <input name="question" required maxLength={200} />
          </label>
          <label className="pr-dash-field">
            Answer
            <textarea name="answer" required rows={3} maxLength={1500} />
          </label>
          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn">
              Add question
            </button>
          </div>
        </form>
      </div>

      {faqs.map((f, i) => (
        <div className="pr-dash-card" style={{ marginTop: "16px" }} key={f.id}>
          <form action={saveFaq.bind(null, f.id)} className="pr-dash-form">
            <label className="pr-dash-field">
              Question
              <input name="question" defaultValue={f.question} required maxLength={200} />
            </label>
            <label className="pr-dash-field">
              Answer
              <textarea name="answer" defaultValue={f.answer} required rows={3} maxLength={1500} />
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="is_active" defaultChecked={f.is_active === 1} /> Shown on the site
            </label>
            <div className="pr-dash-actions">
              <button type="submit" className="pr-dash-btn">
                Save
              </button>
            </div>
          </form>
          {/* Move/delete are their own forms -- separate from the save form above (no nested forms). */}
          <div className="pr-dash-actions" style={{ marginTop: "8px" }}>
            <form action={moveFaqAction.bind(null, f.id, "up")}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === 0}>
                ↑ Up
              </button>
            </form>
            <form action={moveFaqAction.bind(null, f.id, "down")}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" disabled={i === faqs.length - 1}>
                ↓ Down
              </button>
            </form>
            <form action={removeFaq.bind(null, f.id)}>
              <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">
                Delete
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
