"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import { writeHero, getHero, DEFAULT_HERO } from "@/lib/queries/settings";

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

  // The hero renders on the landing page (app/[lang]/page.tsx).
  revalidatePath("/[lang]", "page");
  revalidatePath("/dashboard/homepage");
  redirect("/dashboard/homepage?saved=1");
}
