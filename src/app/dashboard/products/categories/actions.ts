"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import {
  createTourCategory,
  updateTourCategory,
  deleteTourCategory,
  moveTourCategory,
} from "@/lib/queries/tour-categories";

function revalidateCategories(): void {
  revalidatePath("/dashboard/products/categories");
  // Categories are the homepage's tour groupings, so a change reaches the
  // public landing page too.
  revalidatePath("/[lang]", "page");
}

export async function addCategory(formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  if (!name) redirect("/dashboard/products/categories?error=name_required");
  await createTourCategory(name, tagline);
  revalidateCategories();
  redirect("/dashboard/products/categories?saved=1");
}

export async function saveCategory(id: string, formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const coverImageId = String(formData.get("cover_image_id") ?? "").trim();
  const isActive = formData.get("is_active") === "on";
  if (!name) redirect("/dashboard/products/categories?error=name_required");
  await updateTourCategory(id, name, tagline, coverImageId, isActive);
  revalidateCategories();
  redirect("/dashboard/products/categories?saved=1");
}

export async function removeCategory(id: string): Promise<void> {
  await requireStaff();
  const deleted = await deleteTourCategory(id);
  revalidateCategories();
  // A category with tours can't be hard-deleted -- reassign or retire it instead.
  redirect(deleted ? "/dashboard/products/categories?saved=1" : "/dashboard/products/categories?error=has_tours");
}

export async function moveCategoryAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveTourCategory(id, direction);
  revalidateCategories();
}
