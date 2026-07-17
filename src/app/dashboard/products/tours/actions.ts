"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateTour, updateTourRatePrice } from "@/lib/queries/tours";
import { requireStaff } from "@/lib/access";

// Signals an expected staff data-entry mistake -- caught in saveTour and turned
// into a ?error= redirect (a friendly banner), NOT a thrown error that
// production would redact to an opaque digest. (Audit A14.)
class TourFormError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** "" -> null (staff cleared it), otherwise a validated finite number. */
function optionalNumber(raw: FormDataEntryValue | null, label: string, { integer = false } = {}): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    throw new TourFormError("invalid_number");
  }
  return n;
}

export async function saveTour(tourId: string, formData: FormData) {
  // Server Actions are reachable via direct POST regardless of whether the
  // dashboard layout ever rendered for this caller -- re-verify here. See
  // requireStaff()'s doc comment in src/lib/access.ts for why this can't be
  // left to the layout alone.
  await requireStaff();

  // Validation and mutation are wrapped together; an expected mistake becomes a
  // ?error= banner on the tour page instead of a redacted digest. The most
  // common ones (blank name, blank price, min>max) are also blocked/hinted
  // client-side, so this is the backstop. redirect()'s own NEXT_REDIRECT is
  // NOT a TourFormError, so the success redirect at the end propagates. (A14.)
  try {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new TourFormError("name_required");

    const minGroup = optionalNumber(formData.get("min_group"), "min group size", { integer: true });
    const maxGroup = optionalNumber(formData.get("max_group"), "max group size", { integer: true });
    if (minGroup != null && maxGroup != null && minGroup > maxGroup) {
      throw new TourFormError("min_max");
    }

    // The public card's sales bullets. One per line in the form; stored as the
    // JSON array the `includes` TEXT column has always held -- staff should
    // never see or type JSON (plan §3: "no raw JSON/IDs shown").
    const includes = String(formData.get("includes") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // Parse all rate prices BEFORE any write, so a bad one can't leave a
    // half-saved tour (basics updated, a price rejected).
    const rateUpdates: { id: string; price: number }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("rate-")) continue;
      const rateId = key.slice("rate-".length);
      // The emptiness check is NOT redundant with isFinite: Number("") is 0, not
      // NaN, so a cleared price field silently made the tour FREE rather than
      // failing. A price is money -- it has no safe default.
      const raw = String(value).trim();
      if (!raw) throw new TourFormError("blank_price");
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0) throw new TourFormError("invalid_number");
      rateUpdates.push({ id: rateId, price });
    }

    await updateTour(tourId, {
      name,
      tagline: String(formData.get("tagline") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      badge: String(formData.get("badge") ?? "").trim(),
      is_active: formData.get("is_active") === "on",
      cover_image_id: String(formData.get("cover_image_id") ?? "").trim(),
      distance_km: optionalNumber(formData.get("distance_km"), "distance"),
      duration_label: String(formData.get("duration_label") ?? "").trim(),
      min_group: minGroup,
      max_group: maxGroup,
      includes: JSON.stringify(includes),
      sort_order: optionalNumber(formData.get("sort_order"), "sort order", { integer: true }) ?? 0,
    });
    for (const r of rateUpdates) await updateTourRatePrice(r.id, tourId, r.price);
  } catch (err) {
    if (err instanceof TourFormError) {
      redirect(`/dashboard/products/tours/${tourId}?error=${err.code}`);
    }
    throw err;
  }

  revalidatePath("/dashboard/products/tours");
  revalidatePath(`/dashboard/products/tours/${tourId}`);
  redirect(`/dashboard/products/tours/${tourId}?saved=1`);
}
