/**
 * The site's static "chrome" text (Nav, Footer) that MiniMax translates into
 * TH/RU/ZH and caches in content_translations (migration 0009). EN is the
 * canonical value, defined here in code -- not editable by staff, unlike the
 * homepage sections/hero/logo text in queries/settings.ts, which is dynamic
 * CMS content and out of scope for this pass.
 *
 * `{token}` placeholders (e.g. footer.rated_by) must survive translation
 * literally -- the AI is instructed to preserve them, and getChromeStrings'
 * caller interpolates the real value in afterward.
 */

export interface ChromeStringDef {
  key: string;
  en: string;
}

// NOT annotated `: readonly ChromeStringDef[]`. That annotation widened the
// literals back to `string` despite the `as const`, so ChromeKey resolved to
// plain `string` and Record<ChromeKey, string> to Record<string, string> --
// meaning a typo'd key like strings["nav.book_nwo"] type-checked cleanly and
// rendered nothing at runtime (or threw on .replaceAll for footer.rated_by).
// Letting inference keep the literal union is the whole point of the type.
// `satisfies` still enforces the shape without widening it.
export const CHROME_STRINGS = [
  { key: "nav.home", en: "Home" },
  { key: "nav.adventures", en: "Adventures" },
  { key: "nav.why", en: "Why us" },
  { key: "nav.reviews", en: "Reviews" },
  { key: "nav.faq", en: "FAQ" },
  { key: "nav.whatsapp", en: "WhatsApp" },
  { key: "nav.book_now", en: "Book now" },
  { key: "nav.menu_aria", en: "Menu" },
  { key: "footer.whatsapp_us", en: "WhatsApp us" },
  { key: "footer.tour_packages_heading", en: "Tour packages" },
  { key: "footer.explore_heading", en: "Explore" },
  { key: "footer.all_tour_packages", en: "All tour packages" },
  { key: "footer.gallery", en: "Gallery" },
  { key: "footer.why_choose_us", en: "Why choose us" },
  { key: "footer.reviews", en: "Reviews" },
  { key: "footer.faq", en: "FAQ" },
  { key: "footer.blog", en: "Blog" },
  { key: "footer.contact_heading", en: "Contact" },
  { key: "footer.hours", en: "Daily · 8am–6pm" },
  { key: "footer.privacy", en: "Privacy" },
  { key: "footer.terms", en: "Terms" },
  { key: "footer.waiver", en: "Waiver" },
  { key: "footer.rated_by", en: "Rated {rating}★ by {count} travelers" },
] as const satisfies readonly ChromeStringDef[];

export type ChromeKey = (typeof CHROME_STRINGS)[number]["key"];

export const CHROME_EN: Readonly<Record<ChromeKey, string>> = Object.freeze(
  Object.fromEntries(CHROME_STRINGS.map((s) => [s.key, s.en])) as Record<ChromeKey, string>
);
