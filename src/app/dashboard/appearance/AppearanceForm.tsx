"use client";

import { useState } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { THEME_PRESETS, deriveThemeVars, whiteTextIsReadable } from "@/lib/theme";
import type { Theme, Logo } from "@/lib/queries/settings";
import { saveAppearance } from "./actions";

/**
 * Live-preview Appearance editor. Client-side only so staff see the brand
 * colour (and its derived hover/soft shades) and the wordmark update as they
 * type -- the actual save is the plain server action; the colour is submitted
 * as a hidden field so a native <input type=color> + preset swatches both feed
 * the same value. The contrast note is guidance only (whiteTextIsReadable);
 * the backend accepts any valid hex.
 */
export function AppearanceForm({ theme, logo }: { theme: Theme; logo: Logo }) {
  const [brandColor, setBrandColor] = useState(theme.brandColor);
  const [wordOne, setWordOne] = useState(logo.wordOne);
  const [wordTwo, setWordTwo] = useState(logo.wordTwo);

  const vars = deriveThemeVars(brandColor);
  const readable = whiteTextIsReadable(brandColor);

  return (
    <form action={saveAppearance} className="pr-dash-form">
      <input type="hidden" name="brand_color" value={brandColor} />

      <div className="pr-dash-card">
        <h2>Brand colour</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14px", marginBottom: "12px" }}>
          Pick your main colour -- the darker hover shade and pale tint are derived automatically.
        </p>

        <div className="pr-appear-presets">
          {THEME_PRESETS.map((p) => (
            <button
              type="button"
              key={p.brandColor}
              className={"pr-appear-swatch" + (p.brandColor === brandColor.toLowerCase() ? " pr-appear-swatch-on" : "")}
              style={{ background: p.brandColor }}
              title={p.label}
              aria-label={p.label}
              onClick={() => setBrandColor(p.brandColor)}
            />
          ))}
          <label className="pr-appear-custom" title="Custom colour">
            <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
            Custom
          </label>
        </div>

        {/* Live preview: the derived shades + a sample button, so staff judge
            the real result before saving. */}
        <div className="pr-appear-preview">
          <span className="pr-appear-chip" style={{ background: vars.accent }}>accent</span>
          <span className="pr-appear-chip" style={{ background: vars.accentDark }}>hover</span>
          <span className="pr-appear-chip pr-appear-chip-soft" style={{ background: vars.accentSoft }}>soft</span>
          <span className="pr-appear-btn" style={{ background: vars.accent }}>
            Book now
          </span>
          <code style={{ fontSize: "13px", color: "var(--ink-2)" }}>{brandColor}</code>
        </div>
        {!readable && (
          <p className="pr-dash-error" style={{ marginTop: "8px" }}>
            Heads up: white button text may be hard to read on this colour. A darker shade reads better.
          </p>
        )}
      </div>

      <div className="pr-dash-card">
        <h2>Logo</h2>
        <p style={{ color: "var(--ink-2)", fontSize: "14px", marginBottom: "12px" }}>
          Upload a logo image, or leave it empty to use the two-word text logo below.
        </p>
        <ImageUploadField name="logo_image_id" initialPublicId={logo.imageId} label="Logo image (optional)" />

        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "16px" }}>
          <label className="pr-dash-field" style={{ maxWidth: "200px" }}>
            Wordmark -- first word
            <input name="word_one" value={wordOne} onChange={(e) => setWordOne(e.target.value)} maxLength={30} />
          </label>
          <label className="pr-dash-field" style={{ maxWidth: "200px" }}>
            Wordmark -- second word
            <input name="word_two" value={wordTwo} onChange={(e) => setWordTwo(e.target.value)} maxLength={30} />
          </label>
        </div>
        {/* Preview the text logo the way the site renders it (second word in the
            brand colour). Only meaningful when no image is set. */}
        <div className="pr-appear-logo-preview">
          {wordOne || "PHUKET"} <span style={{ color: vars.accent }}>{wordTwo || "RAFTING"}</span>
        </div>
      </div>

      <div className="pr-dash-actions">
        <button type="submit" className="pr-dash-btn">Save appearance</button>
      </div>
    </form>
  );
}
