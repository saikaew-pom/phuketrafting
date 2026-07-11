"use server";

import { revalidatePath } from "next/cache";
import { updateCampZone, updateCampRatePrices } from "@/lib/queries/camping";

export async function saveCampZone(zoneId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
  }

  await updateCampZone(zoneId, {
    name,
    tagline: String(formData.get("tagline") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    is_active: formData.get("is_active") === "on",
  });

  // Rate rows are named rate-weekday-<id> / rate-weekend-<id>.
  const rateIds = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith("rate-weekday-")) rateIds.add(key.slice("rate-weekday-".length));
  }
  for (const rateId of rateIds) {
    const weekday = Number(formData.get(`rate-weekday-${rateId}`));
    const weekend = Number(formData.get(`rate-weekend-${rateId}`));
    if (!Number.isFinite(weekday) || weekday < 0 || !Number.isFinite(weekend) || weekend < 0) {
      throw new Error(`Invalid price for rate ${rateId}`);
    }
    await updateCampRatePrices(rateId, weekday, weekend);
  }

  revalidatePath("/dashboard/products/camping");
  revalidatePath(`/dashboard/products/camping/${zoneId}`);
}
