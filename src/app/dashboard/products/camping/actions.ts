"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateCampZone,
  updateCampRatePrices,
  createCampUnit,
  updateCampUnit,
  setCampUnitBlocked,
  deleteCampUnit,
  createCampZone,
  deleteCampZone,
  moveCampZone,
} from "@/lib/queries/camping";
import { requireStaff } from "@/lib/access";

export async function saveCampZone(zoneId: string, formData: FormData) {
  // Server Actions are reachable via direct POST regardless of whether the
  // dashboard layout ever rendered for this caller -- re-verify here. See
  // requireStaff()'s doc comment in src/lib/access.ts for why this can't be
  // left to the layout alone.
  await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
  }

  const sortOrder = Number(String(formData.get("sort_order") ?? "0").trim() || "0");
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error("Invalid sort order");
  }

  await updateCampZone(zoneId, {
    name,
    tagline: String(formData.get("tagline") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    is_active: formData.get("is_active") === "on",
    cover_image_id: String(formData.get("cover_image_id") ?? "").trim(),
    sleeps_label: String(formData.get("sleeps_label") ?? "").trim(),
    sort_order: sortOrder,
  });

  // Rate rows are named rate-weekday-<id> / rate-weekend-<id>.
  const rateIds = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith("rate-weekday-")) rateIds.add(key.slice("rate-weekday-".length));
  }
  for (const rateId of rateIds) {
    // Blank is rejected, not coerced: Number("") is 0, not NaN, so clearing a
    // nightly rate silently made the stay free. Money has no safe default.
    const rawWeekday = String(formData.get(`rate-weekday-${rateId}`) ?? "").trim();
    const rawWeekend = String(formData.get(`rate-weekend-${rateId}`) ?? "").trim();
    if (!rawWeekday || !rawWeekend) {
      throw new Error("Prices can't be blank -- enter 0 only if the stay really is free.");
    }
    const weekday = Number(rawWeekday);
    const weekend = Number(rawWeekend);
    if (!Number.isFinite(weekday) || weekday < 0 || !Number.isFinite(weekend) || weekend < 0) {
      throw new Error(`Invalid price for rate ${rateId}`);
    }
    await updateCampRatePrices(rateId, weekday, weekend);
  }

  revalidatePath("/dashboard/products/camping");
  revalidatePath(`/dashboard/products/camping/${zoneId}`);
}

/* -------------------------------------------------------------------------
 * Camp units -- the physical tents. A zone is the product; these are the
 * inventory rows camp availability is actually checked against
 * (scheduling.ts's claimCampUnitBooking). Without these screens a zone can be
 * priced and photographed but has nothing to sell.
 * ---------------------------------------------------------------------- */

function parseOccupancy(formData: FormData): number {
  // Blank rejected, not coerced -- Number("") is 0, and an occupancy-0 tent
  // would be sold to nobody while still looking like real inventory. Same
  // reasoning as the blank-price guard above.
  const raw = String(formData.get("occupancy") ?? "").trim();
  if (!raw) throw new Error("Occupancy is required.");
  const occupancy = Number(raw);
  if (!Number.isInteger(occupancy) || occupancy < 1) {
    throw new Error("Occupancy must be a whole number of at least 1.");
  }
  return occupancy;
}

function revalidateZone(zoneId: string): void {
  revalidatePath(`/dashboard/products/camping/${zoneId}`);
  // The camp calendar reads these same rows -- a unit blocked here must not
  // keep showing as bookable there.
  revalidatePath("/dashboard/availability/camping");
}

export async function addCampUnit(zoneId: string, formData: FormData): Promise<void> {
  await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Give the tent a name -- it's what staff read on the day sheet.");

  await createCampUnit(zoneId, name, parseOccupancy(formData));
  revalidateZone(zoneId);
}

export async function saveCampUnit(zoneId: string, unitId: string, formData: FormData): Promise<void> {
  await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");

  await updateCampUnit(unitId, {
    name,
    occupancy: parseOccupancy(formData),
    is_active: formData.get("is_active") === "on",
  });
  revalidateZone(zoneId);
}

export async function toggleCampUnitBlocked(
  zoneId: string,
  unitId: string,
  blocked: boolean,
  formData: FormData
): Promise<void> {
  await requireStaff();

  const reason = String(formData.get("block_reason") ?? "").trim();
  if (blocked && !reason) {
    throw new Error("Give a reason -- it's what staff see later when asking why this tent is out.");
  }

  const changes = await setCampUnitBlocked(unitId, blocked, reason);
  if (changes === 0) throw new Error("That tent no longer exists.");
  revalidateZone(zoneId);
}

export async function removeCampUnit(zoneId: string, unitId: string): Promise<void> {
  await requireStaff();

  const deleted = await deleteCampUnit(unitId);
  if (!deleted) {
    throw new Error(
      "This tent has bookings against it, so deleting it would take their history with it. " +
        "Uncheck “Active” instead -- it stops being sold but the records stay."
    );
  }
  revalidateZone(zoneId);
}

/**
 * Creates a camp zone (with the three standard stay packages) and jumps to its
 * edit page. (CMS gap: product create.)
 */
export async function createCampZoneAction(formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard/products/camping?error=name_required");
  const id = await createCampZone(name);
  revalidatePath("/dashboard/products/camping");
  redirect(`/dashboard/products/camping/${id}?saved=1`);
}

export async function deleteCampZoneAction(id: string): Promise<void> {
  await requireStaff();
  const result = await deleteCampZone(id);
  revalidatePath("/dashboard/products/camping");
  // A zone with tents/bookings can't be hard-deleted -- deactivate instead.
  redirect(`/dashboard/products/camping${result === "blocked" ? "?error=has_activity" : ""}`);
}

export async function moveCampZoneAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveCampZone(id, direction);
  revalidatePath("/dashboard/products/camping");
  revalidatePath("/[lang]", "page");
}
