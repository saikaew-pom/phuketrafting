import { getDb } from "@/lib/db";
import { CHROME_EN, type ChromeKey } from "@/lib/chrome-strings";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * content_translations (migration 0009) is shaped for row-scoped content
 * (content_type + content_id identifying a specific tour/blog_post/... row).
 * Site chrome and the homepage settings objects have no natural content_id,
 * so they use a fixed "global" id -- decided here rather than adding a second
 * table, since the unique index (content_type, content_id, field_name, locale)
 * works fine with a constant content_id.
 */
const CHROME_CONTENT_TYPE = "chrome";
const GLOBAL_CONTENT_ID = "global";

/** Raw cached translations for one content object, no EN fallback applied. */
export async function getTranslationMap(
  contentType: string,
  contentId: string,
  locale: Locale,
  dbOverride?: D1Database
): Promise<Record<string, string>> {
  if (locale === DEFAULT_LOCALE) return {};

  const db = dbOverride ?? getDb();
  const { results } = await db
    .prepare(
      `SELECT field_name, translated_value FROM content_translations
       WHERE content_type = ?1 AND content_id = ?2 AND locale = ?3`
    )
    .bind(contentType, contentId, locale)
    .all<{ field_name: string; translated_value: string }>();

  const map: Record<string, string> = {};
  for (const row of results) {
    if (row.translated_value.trim() !== "") map[row.field_name] = row.translated_value;
  }
  return map;
}

/**
 * Upserts a batch of {field: translated_value} for one content object and
 * locale. Sequential writes, not db.batch(): this is a staff-triggered,
 * low-frequency dashboard action (same reasoning as gallery actions.ts's
 * saveGalleryImages), and each row is independent -- a partial failure
 * mid-batch still leaves the successfully-written fields correctly translated
 * rather than losing all of them to one bad row.
 *
 * `allowedKeys` rejects any field the current EN content doesn't define (a
 * stale AI response naming a since-removed field), and empty values are
 * skipped -- same "never let a bad write break rendering" stance as the
 * getters.
 */
export async function saveTranslations(
  contentType: string,
  contentId: string,
  locale: Locale,
  values: Record<string, string>,
  allowedKeys: ReadonlySet<string>
): Promise<void> {
  const db = getDb();
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.has(key) || typeof value !== "string" || !value.trim()) continue;
    await db
      .prepare(
        `INSERT INTO content_translations (content_type, content_id, field_name, locale, translated_value, is_stale, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, unixepoch())
         ON CONFLICT(content_type, content_id, field_name, locale)
         DO UPDATE SET translated_value = excluded.translated_value, is_stale = 0, generated_at = unixepoch()`
      )
      .bind(contentType, contentId, key, locale, value.trim())
      .run();
  }
}

/**
 * Flags every cached translation of a content object as stale, across all
 * locales. Called when an admin edits the ENGLISH copy: the cached TH/RU/ZH
 * values now describe text that no longer exists.
 *
 * Deliberately marks rather than deletes. Deleting would silently revert the
 * whole page to English the moment someone fixes a typo in the EN heading --
 * a visibly worse regression than briefly serving a slightly-outdated
 * translation, which is what `is_stale` (migration 0009's own column, unused
 * until now) exists to communicate. The dashboard surfaces it as "needs
 * regenerating"; the public site keeps rendering the stale value until staff
 * act.
 */
export async function markTranslationsStale(contentType: string, contentId: string): Promise<void> {
  await getDb()
    .prepare(`UPDATE content_translations SET is_stale = 1 WHERE content_type = ?1 AND content_id = ?2`)
    .bind(contentType, contentId)
    .run();
}

export interface TranslationStatus {
  locale: Locale;
  /** How many of the content object's current fields have a cached translation. */
  translatedCount: number;
  /** Most recent generated_at across this locale's rows, or null if never generated. */
  lastGeneratedAt: number | null;
  /** True when the English copy changed since these were generated. */
  isStale: boolean;
}

/**
 * Per-locale coverage for the dashboard screen -- lets staff see "TH: 22/22,
 * generated 3 days ago" instead of guessing whether a generate run finished.
 * Only fields the CURRENT English content still defines are counted, so a
 * renamed field shows as missing coverage rather than inflating the count
 * with an orphaned row.
 */
export async function getTranslationStatus(
  contentType: string,
  contentId: string,
  locales: readonly Locale[],
  knownKeys: ReadonlySet<string>,
  dbOverride?: D1Database
): Promise<TranslationStatus[]> {
  const db = dbOverride ?? getDb();
  return Promise.all(
    locales.map(async (locale) => {
      const { results } = await db
        .prepare(
          `SELECT field_name, generated_at, is_stale FROM content_translations
           WHERE content_type = ?1 AND content_id = ?2 AND locale = ?3`
        )
        .bind(contentType, contentId, locale)
        .all<{ field_name: string; generated_at: number; is_stale: number }>();

      const known = results.filter((r) => knownKeys.has(r.field_name));
      return {
        locale,
        translatedCount: known.length,
        lastGeneratedAt: known.length > 0 ? Math.max(...known.map((r) => r.generated_at)) : null,
        isStale: known.some((r) => r.is_stale === 1),
      };
    })
  );
}

const CHROME_KEYS: ReadonlySet<string> = new Set(Object.keys(CHROME_EN));

/**
 * Chrome strings for `locale`, EN falling back per-key -- same
 * degrade-gracefully stance as queries/settings.ts's getters: a missing or
 * partially-generated translation must never blank a nav link, only leave it
 * in English.
 */
export async function getChromeStrings(
  locale: Locale,
  dbOverride?: D1Database
): Promise<Record<ChromeKey, string>> {
  const map = await getTranslationMap(CHROME_CONTENT_TYPE, GLOBAL_CONTENT_ID, locale, dbOverride);
  const merged = { ...CHROME_EN };
  for (const [key, value] of Object.entries(map)) {
    if (key in merged) merged[key as ChromeKey] = value;
  }
  return merged;
}

export function saveChromeTranslations(locale: Locale, values: Record<string, string>): Promise<void> {
  return saveTranslations(CHROME_CONTENT_TYPE, GLOBAL_CONTENT_ID, locale, values, CHROME_KEYS);
}

export function getChromeTranslationStatus(
  locales: readonly Locale[],
  dbOverride?: D1Database
): Promise<TranslationStatus[]> {
  return getTranslationStatus(CHROME_CONTENT_TYPE, GLOBAL_CONTENT_ID, locales, CHROME_KEYS, dbOverride);
}
