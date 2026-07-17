"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { addImage, deleteImage, moveImage, type ImageOwnerType } from "@/lib/queries/images";

// Supplementary images per product (F4 / audit #8). The canonical cover stays
// on tours/camp_zones.cover_image_id, edited on the same page; this manages the
// rest. Used by both the tour and camp-zone edit pages.

function revalidateProduct(ownerType: ImageOwnerType, ownerId: string): void {
  const base = ownerType === "tour" ? "tours" : "camping";
  revalidatePath(`/dashboard/products/${base}/${ownerId}`);
}

export async function addProductImage(ownerType: ImageOwnerType, ownerId: string, formData: FormData): Promise<void> {
  await requireStaff();
  const imageId = String(formData.get("image_id") ?? "").trim();
  if (!imageId) return;
  const label = String(formData.get("label") ?? "").trim();
  await addImage(ownerType, ownerId, imageId, label || null);
  revalidateProduct(ownerType, ownerId);
}

export async function removeProductImage(ownerType: ImageOwnerType, ownerId: string, id: string): Promise<void> {
  await requireStaff();
  await deleteImage(id);
  revalidateProduct(ownerType, ownerId);
}

export async function moveProductImage(
  ownerType: ImageOwnerType,
  ownerId: string,
  id: string,
  direction: "up" | "down"
): Promise<void> {
  await requireStaff();
  await moveImage(id, direction);
  revalidateProduct(ownerType, ownerId);
}
