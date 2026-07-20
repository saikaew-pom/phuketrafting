"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import {
  writeHero,
  getHero,
  DEFAULT_HERO,
  writeSections,
  getSections,
  DEFAULT_SECTIONS,
  writeSeo,
  getSeo,
} from "@/lib/queries/settings";
import { markTranslationsStale } from "@/lib/queries/translations";
import {
  HERO_CONTENT_TYPE,
  SECTIONS_CONTENT_TYPE,
  SEO_CONTENT_TYPE,
  GLOBAL_CONTENT_ID,
} from "@/lib/translatable-content";

/** Blank -> keep the current stored value (backstop: the getter's per-field default). */
function pick(formData: FormData, name: string, fallback: string): string {
  const v = String(formData.get(name) ?? "").trim();
  return v !== "" ? v : fallback;
}

/**
 * Admin-gated homepage copy editor (hero stage). Blank required fields fall
 * back to the current stored value (not the hardcoded default), so clearing a
 * box by accident doesn't silently reset it to launch copy -- the getter's own
 * per-field defaulting is the final backstop. headingEmphasis is allowed blank
 * ("" = no highlighted word).
 */
export async function saveHomepage(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const current = await getHero();

  const field = (name: string, fallback: string): string => {
    const v = String(formData.get(name) ?? "").trim();
    return v !== "" ? v : fallback;
  };

  await writeHero(
    {
      heading: field("heading", current.heading),
      // Emphasis may legitimately be emptied -- read straight, don't fall back.
      headingEmphasis: String(formData.get("heading_emphasis") ?? "").trim(),
      subheading: field("subheading", current.subheading),
      backgroundImageId: field("background_image_id", current.backgroundImageId || DEFAULT_HERO.backgroundImageId),
      primaryCtaLabel: field("primary_cta", current.primaryCtaLabel),
      secondaryCtaLabel: field("secondary_cta", current.secondaryCtaLabel),
      trustOne: field("trust_one", current.trustOne),
      trustTwo: field("trust_two", current.trustTwo),
      trustThree: field("trust_three", current.trustThree),
    },
    staff.email
  );

  // Cached TH/RU/ZH translations now describe the OLD English copy. Flagged,
  // not deleted, so the site keeps rendering them until staff regenerate --
  // see markTranslationsStale.
  await markTranslationsStale(HERO_CONTENT_TYPE, GLOBAL_CONTENT_ID);

  // The hero renders on the landing page (app/[lang]/page.tsx).
  revalidatePath("/[lang]", "page");
  revalidatePath("/dashboard/homepage");
  revalidatePath("/dashboard/translations");
  redirect("/dashboard/homepage?saved=1");
}

/**
 * The supporting bands (how-it-works, why-us, closing CTA, footer strapline).
 * Same blank-keeps-current stance as saveHomepage. The step/why lists are a
 * FIXED count (icons stay in code) -- we rebuild them by index off the current
 * values, so a missing field can't drop or reorder an item.
 */
export async function saveSections(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const current = await getSections();

  const steps = current.steps.map((d, i) => ({
    title: pick(formData, `step_${i}_title`, d.title),
    text: pick(formData, `step_${i}_text`, d.text),
  }));
  const whyCards = current.whyCards.map((d, i) => ({
    title: pick(formData, `why_${i}_title`, d.title),
    text: pick(formData, `why_${i}_text`, d.text),
  }));

  await writeSections(
    {
      howEyebrow: pick(formData, "how_eyebrow", current.howEyebrow),
      howTitle: pick(formData, "how_title", current.howTitle),
      howSub: pick(formData, "how_sub", current.howSub),
      steps,
      whyEyebrow: pick(formData, "why_eyebrow", current.whyEyebrow),
      whyTitle: pick(formData, "why_title", current.whyTitle),
      whyLead: pick(formData, "why_lead", current.whyLead),
      whyCards,
      finalPill: pick(formData, "final_pill", current.finalPill),
      finalHeading: pick(formData, "final_heading", current.finalHeading),
      finalSub: pick(formData, "final_sub", current.finalSub),
      finalImageId: pick(formData, "final_image_id", current.finalImageId || DEFAULT_SECTIONS.finalImageId),
      finalPrimaryLabel: pick(formData, "final_primary", current.finalPrimaryLabel),
      footerStrapline: pick(formData, "footer_strapline", current.footerStrapline),
    },
    staff.email
  );

  await markTranslationsStale(SECTIONS_CONTENT_TYPE, GLOBAL_CONTENT_ID);

  // These render on the landing page (bands) AND the footer (strapline, in the
  // shared [lang] layout) -- revalidate the whole public tree.
  revalidatePath("/[lang]", "layout");
  revalidatePath("/dashboard/homepage");
  revalidatePath("/dashboard/translations");
  redirect("/dashboard/homepage?saved=1#sections");
}

/** SEO meta: title / description / share image. */
export async function saveSeo(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const current = await getSeo();

  await writeSeo(
    {
      title: pick(formData, "seo_title", current.title),
      description: pick(formData, "seo_description", current.description),
      shareImageId: pick(formData, "seo_image_id", current.shareImageId),
    },
    staff.email
  );

  await markTranslationsStale(SEO_CONTENT_TYPE, GLOBAL_CONTENT_ID);

  revalidatePath("/[lang]", "page");
  revalidatePath("/dashboard/homepage");
  revalidatePath("/dashboard/translations");
  redirect("/dashboard/homepage?saved=1#seo");
}
