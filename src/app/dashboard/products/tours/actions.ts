"use server";

import { revalidatePath } from "next/cache";
import { updateTour, updateTourRatePrice } from "@/lib/queries/tours";

export async function saveTour(tourId: string, formData: FormData) {
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
