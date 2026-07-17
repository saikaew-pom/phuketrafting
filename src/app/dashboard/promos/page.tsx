import { requireStaff } from "@/lib/access";
import { listPromoCodes, type PromoCode } from "@/lib/queries/promos";
import { listTours, type Tour } from "@/lib/queries/tours";
import { addPromoCode, savePromoCode, removePromoCode } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  bad_code: "Code must be 2-40 characters: letters, numbers, - or _ only.",
  bad_type: "Choose a discount type.",
  bad_value: "Enter a discount amount greater than 0.",
  percent_too_big: "A percentage discount can't be more than 100.",
  bad_date: "Dates must be in YYYY-MM-DD format.",
  date_order: "The 'valid until' date can't be before 'valid from'.",
  bad_cap: "Usage limit must be a whole number of at least 1.",
  duplicate: "That code already exists -- pick a different one.",
  has_bookings: "This code has been used on bookings, so it can't be deleted. Untick 'Active' to retire it instead.",
};

// Shared field set for the add + edit forms.
function PromoFields({ promo, tours }: { promo?: PromoCode; tours: Tour[] }) {
  return (
    <>
      <label className="pr-dash-field">
        Code
        <input name="code" defaultValue={promo?.code ?? ""} required maxLength={40} placeholder="e.g. SONGKRAN25" style={{ textTransform: "uppercase" }} />
        <span className="pr-dash-field-hint">Letters, numbers, - or _. Stored uppercase.</span>
      </label>
      <div className="pr-dash-actions">
        <label className="pr-dash-field" style={{ maxWidth: "180px" }}>
          Discount type
          <select name="discount_type" defaultValue={promo?.discount_type ?? "percent"}>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed (฿)</option>
          </select>
        </label>
        <label className="pr-dash-field" style={{ maxWidth: "160px" }}>
          Amount
          <input type="number" name="discount_value" defaultValue={promo?.discount_value ?? ""} min="1" step="1" required />
        </label>
        <label className="pr-dash-field" style={{ maxWidth: "160px" }}>
          Usage limit
          <input type="number" name="usage_cap" defaultValue={promo?.usage_cap ?? ""} min="1" step="1" placeholder="unlimited" />
        </label>
      </div>
      <div className="pr-dash-actions">
        <label className="pr-dash-field" style={{ maxWidth: "200px" }}>
          Valid from
          <input type="date" name="valid_from" defaultValue={promo?.valid_from ?? ""} />
        </label>
        <label className="pr-dash-field" style={{ maxWidth: "200px" }}>
          Valid until
          <input type="date" name="valid_until" defaultValue={promo?.valid_until ?? ""} />
        </label>
        <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
          Applies to
          <select name="scope_tour_id" defaultValue={promo?.scope_tour_id ?? ""}>
            <option value="">All tours</option>
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="pr-dash-check">
        <input type="checkbox" name="is_active" defaultChecked={promo ? promo.is_active === 1 : true} /> Active (guests can use it)
      </label>
    </>
  );
}

export default async function PromosPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireStaff();
  const { error, saved } = await searchParams;
  const [promos, tours] = await Promise.all([listPromoCodes(), listTours()]);
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Promo codes</h1>
        <p>Discount codes guests can enter at checkout. Usage is tracked automatically.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Promo codes updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        </div>
      )}

      <div className="pr-dash-card">
        <h2>New code</h2>
        <form action={addPromoCode} className="pr-dash-form">
          <PromoFields tours={tours} />
          <div className="pr-dash-actions">
            <button type="submit" className="pr-dash-btn">
              Create code
            </button>
          </div>
        </form>
      </div>

      {promos.length === 0 ? (
        <div className="pr-dash-card" style={{ marginTop: "16px" }}>
          <div className="pr-dash-empty">No promo codes yet.</div>
        </div>
      ) : (
        promos.map((p) => (
          <div className="pr-dash-card" style={{ marginTop: "16px" }} key={p.id}>
            <h2>
              {p.code}{" "}
              {p.is_active ? (
                <span className="pr-dash-badge pr-dash-badge-ok">Active</span>
              ) : (
                <span className="pr-dash-badge pr-dash-badge-neutral">Inactive</span>
              )}
              <span className="pr-dash-field-hint">
                {" "}
                used {p.usage_count}
                {p.usage_cap != null ? ` / ${p.usage_cap}` : " (no limit)"}
              </span>
            </h2>
            <form action={savePromoCode.bind(null, p.id)} className="pr-dash-form">
              <PromoFields promo={p} tours={tours} />
              <div className="pr-dash-actions">
                <button type="submit" className="pr-dash-btn">
                  Save
                </button>
              </div>
            </form>
            <div className="pr-dash-actions" style={{ marginTop: "8px" }}>
              <form action={removePromoCode.bind(null, p.id)}>
                <button type="submit" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
