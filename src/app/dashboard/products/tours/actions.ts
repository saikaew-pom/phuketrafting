"use server";

import { revalidatePath } from "next/cache";
import { updateTour, updateTourRatePrice } from "@/lib/queries/tours";
import { requireStaff } from "@/lib/access";

export async function saveTour(tourId: string, formData: FormData) {
  // Server Actions are reachable via direct POST regardless of whether the
  // dashboard layout ever rendered for this caller -- re-verify here. See
  // requireStaff()'s doc comment in src/lib/access.ts for why this can't be
  // left to the layout alone.
  await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
  }

  await updateTour(tourId, {
    name,
    tagline: String(formData.get("tagline") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    badge: String(formData.get("badge") ?? "").trim(),
    is_active: formData.get("is_active") === "on",
    cover_image_id: String(formData.get("cover_image_id") ?? "").trim(),
  });

  // Every rate row on the form is named rate-<rateId>; update each that changed.
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rate-")) continue;
    const rateId = key.slice("rate-".length);
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for rate ${rateId}`);
    }
    await updateTourRatePrice(rateId, price);
  }

  revalidatePath("/dashboard/products/tours");
  revalidatePath(`/dashboard/products/tours/${tourId}`);
}
