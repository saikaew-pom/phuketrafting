import { requireAdmin } from "@/lib/access";
import { getHero, getSections, getSeo } from "@/lib/queries/settings";
import { ImageUploadField } from "@/components/ImageUploadField";
import { saveHomepage, saveSections, saveSeo } from "./actions";

/** Homepage CMS -- all editable homepage copy, images, sections + SEO. */
export default async function HomepagePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const [hero, sections, seo] = await Promise.all([getHero(), getSections(), getSeo()]);

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
          <button type="submit" className="pr-dash-btn">Save hero</button>
        </div>
      </form>

      {/* ---- Supporting sections ---- */}
      <form action={saveSections} className="pr-dash-form" id="sections" style={{ marginTop: "32px" }}>
        <div className="pr-dash-card">
          <h2>How it works</h2>
          <label className="pr-dash-field">
            Eyebrow
            <input name="how_eyebrow" defaultValue={sections.howEyebrow} maxLength={60} />
          </label>
          <label className="pr-dash-field">
            Title
            <input name="how_title" defaultValue={sections.howTitle} maxLength={120} />
          </label>
          <label className="pr-dash-field">
            Sub-text
            <textarea name="how_sub" defaultValue={sections.howSub} rows={2} maxLength={300} />
          </label>
          {sections.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "12px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
              <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
                Step {i + 1} title
                <input name={`step_${i}_title`} defaultValue={s.title} maxLength={80} />
              </label>
              <label className="pr-dash-field" style={{ flex: 1, minWidth: "260px" }}>
                Step {i + 1} text
                <input name={`step_${i}_text`} defaultValue={s.text} maxLength={200} />
              </label>
            </div>
          ))}
        </div>

        <div className="pr-dash-card">
          <h2>Why us</h2>
          <label className="pr-dash-field">
            Eyebrow
            <input name="why_eyebrow" defaultValue={sections.whyEyebrow} maxLength={60} />
          </label>
          <label className="pr-dash-field">
            Title
            <input name="why_title" defaultValue={sections.whyTitle} maxLength={120} />
          </label>
          <label className="pr-dash-field">
            Lead paragraph
            <textarea name="why_lead" defaultValue={sections.whyLead} rows={3} maxLength={500} />
          </label>
          <p style={{ color: "var(--ink-3)", fontSize: "13px", margin: "-4px 0 0" }}>
            You can use {"{travelerCount}"}, {"{googleRating}"} and {"{reviewCount}"} -- they fill in from Settings.
          </p>
          {sections.whyCards.map((w, i) => (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "12px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
              <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
                Card {i + 1} title
                <input name={`why_${i}_title`} defaultValue={w.title} maxLength={80} />
              </label>
              <label className="pr-dash-field" style={{ flex: 1, minWidth: "260px" }}>
                Card {i + 1} text
                <input name={`why_${i}_text`} defaultValue={w.text} maxLength={220} />
              </label>
            </div>
          ))}
        </div>

        <div className="pr-dash-card">
          <h2>Closing call-to-action</h2>
          <label className="pr-dash-field" style={{ maxWidth: "280px" }}>
            Location pill
            <input name="final_pill" defaultValue={sections.finalPill} maxLength={60} />
          </label>
          <label className="pr-dash-field">
            Heading
            <input name="final_heading" defaultValue={sections.finalHeading} maxLength={120} />
          </label>
          <label className="pr-dash-field">
            Sub-text
            <textarea name="final_sub" defaultValue={sections.finalSub} rows={2} maxLength={300} />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "240px" }}>
            Button label
            <input name="final_primary" defaultValue={sections.finalPrimaryLabel} maxLength={40} />
          </label>
          <div style={{ marginTop: "8px" }}>
            <ImageUploadField name="final_image_id" initialPublicId={sections.finalImageId} label="Background image" />
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Footer</h2>
          <label className="pr-dash-field">
            Strapline (under the logo)
            <textarea name="footer_strapline" defaultValue={sections.footerStrapline} rows={2} maxLength={200} />
          </label>
        </div>

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">Save sections</button>
        </div>
      </form>

      {/* ---- SEO ---- */}
      <form action={saveSeo} className="pr-dash-form" id="seo" style={{ marginTop: "32px" }}>
        <div className="pr-dash-card">
          <h2>Search &amp; sharing (SEO)</h2>
          <p style={{ color: "var(--ink-2)", fontSize: "14px", marginBottom: "12px" }}>
            The title in the browser tab and search results, the description under it, and the image shown when the
            page is shared on social media.
          </p>
          <label className="pr-dash-field">
            Page title
            <input name="seo_title" defaultValue={seo.title} maxLength={120} />
          </label>
          <label className="pr-dash-field">
            Description
            <textarea name="seo_description" defaultValue={seo.description} rows={3} maxLength={320} />
          </label>
          <div style={{ marginTop: "8px" }}>
            <ImageUploadField name="seo_image_id" initialPublicId={seo.shareImageId} label="Share image" />
          </div>
        </div>

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">Save SEO</button>
        </div>
      </form>
    </div>
  );
}
