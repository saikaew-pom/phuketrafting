import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { CHROME_STRINGS } from "@/lib/chrome-strings";
import { getChromeTranslationStatus, getTranslationStatus, type TranslationStatus } from "@/lib/queries/translations";
import { getHero, getSections, getSeo } from "@/lib/queries/settings";
import {
  flattenHero,
  flattenSections,
  flattenSeo,
  HERO_CONTENT_TYPE,
  SECTIONS_CONTENT_TYPE,
  SEO_CONTENT_TYPE,
  GLOBAL_CONTENT_ID,
} from "@/lib/translatable-content";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { TranslationsTable, type LocaleRow } from "./TranslationsClient";

const LOCALE_LABELS: Record<string, string> = { th: "Thai", ru: "Russian", zh: "Chinese" };

function toRows(statuses: TranslationStatus[], totalCount: number): LocaleRow[] {
  return statuses.map((s) => ({
    locale: s.locale,
    label: LOCALE_LABELS[s.locale] ?? s.locale,
    translatedCount: s.translatedCount,
    totalCount,
    lastGeneratedText: s.lastGeneratedAt ? formatDateTime(s.lastGeneratedAt) : null,
    isStale: s.isStale,
  }));
}

/**
 * Task 2: TH/RU/ZH translation, generated on demand and cached in D1. Staff,
 * not admin-only: same access level as the other staff-AI features
 * (blog/gallery), it doesn't touch money.
 *
 * Tours, camping and blog posts are per-ROW content (a translation per tour,
 * per post) rather than these two fixed global objects -- their own later
 * stage, with a different UI shape.
 */
export default async function TranslationsPage() {
  try {
    await requireStaff();
  } catch {
    notFound();
  }

  const locales: readonly Locale[] = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);
  const [hero, sections, seo] = await Promise.all([getHero(), getSections(), getSeo()]);
  const heroKeys = new Set(Object.keys(flattenHero(hero)));
  const sectionKeys = new Set(Object.keys(flattenSections(sections)));
  const seoKeys = new Set(Object.keys(flattenSeo(seo)));
  const homepageFieldCount = heroKeys.size + sectionKeys.size + seoKeys.size;

  const [chromeStatus, heroStatus, sectionsStatus, seoStatus] = await Promise.all([
    getChromeTranslationStatus(locales),
    getTranslationStatus(HERO_CONTENT_TYPE, GLOBAL_CONTENT_ID, locales, heroKeys),
    getTranslationStatus(SECTIONS_CONTENT_TYPE, GLOBAL_CONTENT_ID, locales, sectionKeys),
    getTranslationStatus(SEO_CONTENT_TYPE, GLOBAL_CONTENT_ID, locales, seoKeys),
  ]);

  // The three homepage objects are one button to staff, so their per-locale
  // coverage is summed and their stale flags OR'd into a single row.
  const homepageStatus: TranslationStatus[] = locales.map((locale, i) => ({
    locale,
    translatedCount: heroStatus[i].translatedCount + sectionsStatus[i].translatedCount + seoStatus[i].translatedCount,
    lastGeneratedAt: Math.max(
      heroStatus[i].lastGeneratedAt ?? 0,
      sectionsStatus[i].lastGeneratedAt ?? 0,
      seoStatus[i].lastGeneratedAt ?? 0
    ) || null,
    isStale: heroStatus[i].isStale || sectionsStatus[i].isStale || seoStatus[i].isStale,
  }));

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Translations</h1>
        <p>
          Thai, Russian and Chinese, machine-translated by AI and cached -- English stays the source of truth and is
          shown wherever a translation is missing. Regenerate any time; it overwrites the previous version.
        </p>
      </div>

      <div className="pr-dash-card">
        <h2>Site chrome</h2>
        <p className="pr-dash-field-hint" style={{ marginBottom: "10px" }}>
          The nav bar and footer ({CHROME_STRINGS.length} labels) -- shown on every page.
        </p>
        <TranslationsTable rows={toRows(chromeStatus, CHROME_STRINGS.length)} kind="chrome" />
      </div>

      <div className="pr-dash-card" style={{ marginTop: "16px" }}>
        <h2>Homepage content</h2>
        <p className="pr-dash-field-hint" style={{ marginBottom: "10px" }}>
          The hero, the &quot;how it works&quot; and &quot;why us&quot; bands, the closing call-to-action, the footer
          strapline and the page&apos;s search-engine title/description ({homepageFieldCount} fields). Edit the English
          on the Homepage screen; anything you change there is flagged here for regenerating.
        </p>
        <TranslationsTable rows={toRows(homepageStatus, homepageFieldCount)} kind="homepage" />
      </div>

      <div className="pr-dash-card" style={{ marginTop: "16px" }}>
        <h2>Tours, camping &amp; blog</h2>
        <p className="pr-dash-field-hint">Not translated yet -- these come in a later stage.</p>
      </div>
    </div>
  );
}
