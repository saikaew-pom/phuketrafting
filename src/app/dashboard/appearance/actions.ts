"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import { writeAppearance, DEFAULT_THEME, DEFAULT_LOGO } from "@/lib/queries/settings";

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Admin-gated like the rest of Settings: appearance changes the whole public
 * brand, not a front-desk decision. Expected mistakes redirect back with a
 * ?error= banner rather than throwing a redacted digest. The getters
 * (getTheme/getLogo) re-validate every read, so even a bad value that slipped
 * through here would degrade to the default look, not a 500.
 */
export async function saveAppearance(formData: FormData): Promise<void> {
  const staff = await requireAdmin();

  const fail = (c: string) => redirect(`/dashboard/appearance?error=${c}`);

  const brandColor = String(formData.get("brand_color") ?? "").trim().toLowerCase();
  if (!HEX6_RE.test(brandColor)) fail("bad_color");

  // "" from the upload field means "no image -> use the wordmark".
  const rawImageId = String(formData.get("logo_image_id") ?? "").trim();
  const imageId = rawImageId !== "" ? rawImageId : null;

  const wordOne = String(formData.get("word_one") ?? "").trim() || DEFAULT_LOGO.wordOne;
  const wordTwo = String(formData.get("word_two") ?? "").trim() || DEFAULT_LOGO.wordTwo;

  await writeAppearance(
    { brandColor: HEX6_RE.test(brandColor) ? brandColor : DEFAULT_THEME.brandColor },
    { imageId, wordOne, wordTwo },
    staff.email
  );

  // The theme <style> + logo live in [lang]/layout.tsx, which wraps every
  // public page, so revalidate the whole public tree, not just the homepage.
  revalidatePath("/[lang]", "layout");
  revalidatePath("/dashboard/appearance");
  redirect("/dashboard/appearance?saved=1");
}
