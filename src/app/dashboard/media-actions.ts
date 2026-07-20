"use server";

import { requireStaff } from "@/lib/access";
import { listImages } from "@/lib/queries/images";
import { getImageTagsBatch } from "@/lib/queries/tags";

export interface LibraryImage {
  id: string;
  imageId: string;
  label: string | null;
  tags: string[];
}

/**
 * Backs the "Choose from gallery" picker on ImageUploadField -- the gallery
 * (already-uploaded, already-captioned, already-tagged photos) as a reusable
 * media library for every OTHER screen that uploads an image (tour/camp
 * cover, category cover, homepage hero/final/SEO images, logo, blog cover),
 * not just the gallery screen itself.
 *
 * Not scoped to dashboard/gallery/actions.ts because it's used from a shared
 * component with many unrelated callers, not the gallery screen specifically.
 */
export async function listMediaLibraryAction(): Promise<LibraryImage[]> {
  await requireStaff();
  const images = await listImages("gallery", null);
  const tagsByImage = await getImageTagsBatch(images.map((img) => img.id));
  return images.map((img) => ({
    id: img.id,
    imageId: img.image_id,
    label: img.label,
    tags: (tagsByImage.get(img.id) ?? []).map((t) => t.name),
  }));
}
