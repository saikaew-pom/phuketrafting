"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireStaff } from "@/lib/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { describeAiError } from "@/lib/ai";
import { translateChromeStrings, translateContentFields } from "@/lib/translation-ai";
import { saveChromeTranslations, saveTranslations } from "@/lib/queries/translations";
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
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n";

export interface GenerateResult {
  ok: boolean;
  error: string | null;
}

/**
 * "Generate" button per locale (dashboard/translations/page.tsx). Same
 * one-shot staff-AI RPC shape as gallery's suggestCaptionAction -- called
 * directly from a client component, not a <form action>, gated by
 * requireStaff() + the shared staff-ai rate-limit bucket (Audit A25: one
 * bucket per staff member across every AI feature, not per-feature).
 *
 * Unlike the per-field AI buttons (blog/gallery), there's no human-reviewed
 * form field here -- a successful generate writes straight to
 * content_translations and is live immediately. That matches the "translate
 * once, cache in D1, regenerate on demand" architecture: EN is always the
 * fallback if a translation ever looks wrong, and re-running Generate
 * overwrites it.
 */
export async function generateChromeTranslationsAction(locale: string): Promise<GenerateResult> {
  const staff = await requireStaff();
  if (!isSupportedLocale(locale) || locale === DEFAULT_LOCALE) {
    return { ok: false, error: "Not a translatable locale." };
  }

  const allowed = await checkRateLimit(`staff-ai:${staff.email}`, 20, 60);
  if (!allowed) return { ok: false, error: "Too many AI requests -- please wait a minute and try again." };

  const { env } = getCloudflareContext();
  try {
    const values = await translateChromeStrings(locale, env);
    if (!values) return { ok: false, error: "AI isn't configured on this environment." };
    await saveChromeTranslations(locale, values);
    revalidatePath("/dashboard/translations");
    // Nav/Footer render inside [lang]/layout.tsx, wrapping every locale page.
    revalidatePath("/[lang]", "layout");
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }
}

/**
 * Homepage copy (hero + supporting bands + SEO meta). THREE settings objects,
 * translated in ONE AI call and saved under their three separate
 * content_types -- they're one "Generate" click for staff (it's all "the
 * homepage" to them), but they stay separate rows because each is invalidated
 * independently: editing the hero shouldn't mark the SEO description stale.
 *
 * Keys are prefixed per-object in the AI payload and unprefixed on save, so
 * one call can carry all three despite `title` existing in more than one.
 */
export async function generateHomepageTranslationsAction(locale: string): Promise<GenerateResult> {
  const staff = await requireStaff();
  if (!isSupportedLocale(locale) || locale === DEFAULT_LOCALE) {
    return { ok: false, error: "Not a translatable locale." };
  }

  const allowed = await checkRateLimit(`staff-ai:${staff.email}`, 20, 60);
  if (!allowed) return { ok: false, error: "Too many AI requests -- please wait a minute and try again." };

  const [hero, sections, seo] = await Promise.all([getHero(), getSections(), getSeo()]);
  const groups = [
    { type: HERO_CONTENT_TYPE, fields: flattenHero(hero) },
    { type: SECTIONS_CONTENT_TYPE, fields: flattenSections(sections) },
    { type: SEO_CONTENT_TYPE, fields: flattenSeo(seo) },
  ];

  const payload: Record<string, string> = {};
  for (const g of groups) {
    for (const [key, value] of Object.entries(g.fields)) payload[`${g.type}::${key}`] = value;
  }

  const { env } = getCloudflareContext();
  try {
    const values = await translateContentFields(payload, locale, env);
    if (!values) return { ok: false, error: "AI isn't configured on this environment." };

    // Counted, not assumed: translateFieldMap only guarantees the model
    // returned SOME usable string values -- it can't know about the "::"
    // prefixes this action adds. A model that answered with well-formed JSON
    // but dropped the prefixes (or invented its own) passes that check and
    // then matches nothing here, so without this the loop would write zero
    // rows, report ok:true, and leave staff clicking a Generate button that
    // silently does nothing. Same "usable output or a clear try-again" stance
    // as translateFieldMap's own empty-result guard.
    let savedKeys = 0;
    for (const g of groups) {
      const prefix = `${g.type}::`;
      const allowed = new Set(Object.keys(g.fields));
      const unprefixed: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (!key.startsWith(prefix)) continue;
        const field = key.slice(prefix.length);
        // saveTranslations re-filters against this group's real field keys, so
        // a mis-prefixed key from the model lands nowhere rather than in the
        // wrong content_type -- mirrored here so the count matches the writes.
        if (!allowed.has(field) || !value.trim()) continue;
        unprefixed[field] = value;
        savedKeys += 1;
      }
      await saveTranslations(g.type, GLOBAL_CONTENT_ID, locale as Locale, unprefixed, allowed);
    }
    if (savedKeys === 0) {
      return { ok: false, error: "The AI's response didn't match any homepage fields. Try again." };
    }

    revalidatePath("/dashboard/translations");
    // Hero/bands render on the landing page; the footer strapline comes from
    // `sections` and lives in the layout -- revalidate the whole public tree.
    revalidatePath("/[lang]", "layout");
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }
}
