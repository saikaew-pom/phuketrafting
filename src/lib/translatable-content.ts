import {
  type HeroContent,
  type SectionsContent,
  type SeoContent,
} from "@/lib/queries/settings";

/**
 * Turns the staff-editable homepage objects (settings table, JSON-encoded)
 * into flat {fieldKey -> English text} maps for translation, and merges a
 * translated map back over the English original.
 *
 * Flat keys because content_translations (migration 0009) stores ONE row per
 * field_name -- a nested `steps[2].title` needs a stable scalar key, hence
 * "steps.2.title". Merging back by the same key is what lets a partially
 * translated object still render (untranslated fields stay English), the same
 * per-field degrade-gracefully contract as queries/settings.ts's getters.
 *
 * Only TEXT a guest reads is included. Deliberately excluded:
 *   - image ids (backgroundImageId, finalImageId, shareImageId) -- not text.
 *   - headingEmphasis -- it must be a SUBSTRING of `heading` to highlight
 *     anything, and a translated emphasis word is not reliably a substring of
 *     the translated heading. Translating it would silently drop the highlight
 *     (or worse, highlight the wrong span), so the EN value is kept and the
 *     highlight simply doesn't apply on non-EN locales.
 */

export const HERO_CONTENT_TYPE = "hero";
export const SECTIONS_CONTENT_TYPE = "sections";
export const SEO_CONTENT_TYPE = "seo";
/** These objects are singletons in `settings`, so there's one row-id per type. */
export const GLOBAL_CONTENT_ID = "global";

export function flattenHero(hero: HeroContent): Record<string, string> {
  return {
    heading: hero.heading,
    subheading: hero.subheading,
    primaryCtaLabel: hero.primaryCtaLabel,
    secondaryCtaLabel: hero.secondaryCtaLabel,
    trustOne: hero.trustOne,
    trustTwo: hero.trustTwo,
    trustThree: hero.trustThree,
  };
}

export function mergeHero(hero: HeroContent, translated: Record<string, string>): HeroContent {
  const t = (key: keyof HeroContent, fallback: string): string => translated[key]?.trim() || fallback;
  return {
    ...hero,
    heading: t("heading", hero.heading),
    subheading: t("subheading", hero.subheading),
    primaryCtaLabel: t("primaryCtaLabel", hero.primaryCtaLabel),
    secondaryCtaLabel: t("secondaryCtaLabel", hero.secondaryCtaLabel),
    trustOne: t("trustOne", hero.trustOne),
    trustTwo: t("trustTwo", hero.trustTwo),
    trustThree: t("trustThree", hero.trustThree),
  };
}

export function flattenSections(sections: SectionsContent): Record<string, string> {
  const flat: Record<string, string> = {
    howEyebrow: sections.howEyebrow,
    howTitle: sections.howTitle,
    howSub: sections.howSub,
    whyEyebrow: sections.whyEyebrow,
    whyTitle: sections.whyTitle,
    whyLead: sections.whyLead,
    finalPill: sections.finalPill,
    finalHeading: sections.finalHeading,
    finalSub: sections.finalSub,
    finalPrimaryLabel: sections.finalPrimaryLabel,
    footerStrapline: sections.footerStrapline,
  };
  sections.steps.forEach((item, i) => {
    flat[`steps.${i}.title`] = item.title;
    flat[`steps.${i}.text`] = item.text;
  });
  sections.whyCards.forEach((item, i) => {
    flat[`whyCards.${i}.title`] = item.title;
    flat[`whyCards.${i}.text`] = item.text;
  });
  return flat;
}

export function mergeSections(sections: SectionsContent, translated: Record<string, string>): SectionsContent {
  const t = (key: string, fallback: string): string => translated[key]?.trim() || fallback;
  return {
    ...sections,
    howEyebrow: t("howEyebrow", sections.howEyebrow),
    howTitle: t("howTitle", sections.howTitle),
    howSub: t("howSub", sections.howSub),
    whyEyebrow: t("whyEyebrow", sections.whyEyebrow),
    whyTitle: t("whyTitle", sections.whyTitle),
    whyLead: t("whyLead", sections.whyLead),
    finalPill: t("finalPill", sections.finalPill),
    finalHeading: t("finalHeading", sections.finalHeading),
    finalSub: t("finalSub", sections.finalSub),
    finalPrimaryLabel: t("finalPrimaryLabel", sections.finalPrimaryLabel),
    footerStrapline: t("footerStrapline", sections.footerStrapline),
    // Rebuilt BY INDEX off the English list, never off the translated keys --
    // the item count is fixed in code (the icons are), so a translation
    // missing steps.3 keeps step 3 in English rather than dropping it.
    steps: sections.steps.map((item, i) => ({
      title: t(`steps.${i}.title`, item.title),
      text: t(`steps.${i}.text`, item.text),
    })),
    whyCards: sections.whyCards.map((item, i) => ({
      title: t(`whyCards.${i}.title`, item.title),
      text: t(`whyCards.${i}.text`, item.text),
    })),
  };
}

export function flattenSeo(seo: SeoContent): Record<string, string> {
  return { title: seo.title, description: seo.description };
}

export function mergeSeo(seo: SeoContent, translated: Record<string, string>): SeoContent {
  return {
    ...seo,
    title: translated.title?.trim() || seo.title,
    description: translated.description?.trim() || seo.description,
  };
}
