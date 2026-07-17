/**
 * Turns the one admin-chosen brand colour into the three accent CSS tokens the
 * site actually uses (--accent, --accent-dark, --accent-soft), so staff pick a
 * single colour and the darker hover shade + the pale tint derive from it
 * automatically. Deriving (rather than asking staff for three colours) is what
 * keeps the palette coherent and hard to break -- see queries/settings.ts
 * getTheme, which is the validated source of the brand colour.
 *
 * Pure math, no dependencies (this runs in the Worker). Kept out of
 * settings.ts so both the public layout (to emit the <style>) and the
 * dashboard Appearance screen (to preview) can import it without pulling in D1.
 */

/** #rrggbb (validated upstream) -> {r,g,b} 0-255. Falls back to black on junk. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}

/** Darken each channel toward black by `amount` (0-1). */
function darken(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

/** Mix toward white by `t` (0-1) -- t=0.92 gives a very pale tint. */
function tint(hex: string, t: number): string {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r + (255 - r) * t, g: g + (255 - g) * t, b: b + (255 - b) * t });
}

/**
 * Relative luminance (WCAG). Used only to warn the admin when white button
 * text on their chosen accent would be hard to read -- the backend still
 * accepts any valid hex; this is guidance, not a gate.
 */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast ratio (1-21) between two hex colours, WCAG formula. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** True if white text on this colour clears the WCAG AA large-text bar (3:1). */
export function whiteTextIsReadable(hex: string): boolean {
  return contrastRatio(hex, "#ffffff") >= 3;
}

export interface ThemeVars {
  accent: string;
  accentDark: string;
  accentSoft: string;
}

/** The three accent tokens derived from one brand colour. */
export function deriveThemeVars(brandColor: string): ThemeVars {
  return {
    accent: brandColor,
    // 18% darker for the hover/pressed shade, matching the original
    // #e8590c -> #c2410c relationship (~17% darker).
    accentDark: darken(brandColor, 0.18),
    // Very pale wash for selected/soft backgrounds (chips, ticked add-ons).
    accentSoft: tint(brandColor, 0.92),
  };
}

/** Curated safe presets for the Appearance picker (all clear white-text contrast). */
export const THEME_PRESETS: { label: string; brandColor: string }[] = [
  { label: "Rafting Orange (default)", brandColor: "#e8590c" },
  { label: "River Teal", brandColor: "#0d8a8a" },
  { label: "Jungle Green", brandColor: "#0a7d4d" },
  { label: "Deep Ocean", brandColor: "#1665c1" },
  { label: "Sunset Red", brandColor: "#d1341f" },
  { label: "Royal Purple", brandColor: "#6d28d9" },
];
