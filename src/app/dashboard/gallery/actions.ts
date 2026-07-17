"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { addImage, deleteImage, moveImage } from "@/lib/queries/images";

// Revalidate both the dashboard screen and the public landing page (all
// locales) so an edit shows up on the site immediately. The gallery renders
// inside the [lang] route.
function revalidateGallery(): void {
  revalidatePath("/dashboard/gallery");
  revalidatePath("/[lang]", "page");
}

export async function addGalleryImage(formData: FormData): Promise<void> {
  await requireStaff();
  // ImageUploadField submits the Cloudinary public_id under this field name.
  const imageId = String(formData.get("image_id") ?? "").trim();
  if (!imageId) return; // nothing uploaded -- no-op rather than an error row
  const label = String(formData.get("label") ?? "").trim();
  await addImage("gallery", null, imageId, label || null);
  revalidateGallery();
}

export async function removeGalleryImage(id: string): Promise<void> {
  await requireStaff();
  await deleteImage(id);
  revalidateGallery();
}

export async function moveGalleryImage(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveImage(id, direction);
  revalidateGallery();
}
