import { requireAdmin } from "@/lib/access";
import { getHero } from "@/lib/queries/settings";
import { ImageUploadField } from "@/components/ImageUploadField";
import { saveHomepage } from "./actions";

/** Homepage CMS -- hero stage: the big top section's copy, image and buttons. */
export default async function HomepagePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const hero = await getHero();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Homepage</h1>
        <p>The hero -- the big section at the top of the home page. Your brand colour and logo live under Appearance.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Homepage updated.
        </div>
      )}

      <form action={saveHomepage} className="pr-dash-form">
        <div className="pr-dash-card">
          <h2>Headline</h2>
          <label className="pr-dash-field">
            Heading
            <input name="heading" defaultValue={hero.heading} maxLength={160} />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "320px" }}>
            Word to highlight (in the accent colour)
            <input name="heading_emphasis" defaultValue={hero.headingEmphasis} maxLength={60} />
          </label>
          <p style={{ color: "var(--ink-3)", fontSize: "13px", margin: "-4px 0 0" }}>
            Must be a word or phrase that appears in the heading above. Leave blank for no highlight.
          </p>
          <label className="pr-dash-field">
            Sub-text
            <textarea name="subheading" defaultValue={hero.subheading} rows={3} maxLength={400} />
          </label>
        </div>

        <div className="pr-dash-card">
          <h2>Background image</h2>
          <ImageUploadField
            name="background_image_id"
            initialPublicId={hero.backgroundImageId}
            label="Hero background photo"
          />
        </div>

        <div className="pr-dash-card">
          <h2>Buttons</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
              Main button
              <input name="primary_cta" defaultValue={hero.primaryCtaLabel} maxLength={40} />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
              Secondary button
              <input name="secondary_cta" defaultValue={hero.secondaryCtaLabel} maxLength={40} />
            </label>
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Trust badges</h2>
          <p style={{ color: "var(--ink-2)", fontSize: "14px", marginBottom: "12px" }}>
            The three short reassurances under the sub-text (icons are fixed).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Badge 1
              <input name="trust_one" defaultValue={hero.trustOne} maxLength={40} />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Badge 2
              <input name="trust_two" defaultValue={hero.trustTwo} maxLength={40} />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Badge 3
              <input name="trust_three" defaultValue={hero.trustThree} maxLength={40} />
            </label>
          </div>
        </div>

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">Save homepage</button>
        </div>
      </form>
    </div>
  );
}
