"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import {
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  promoCodeExists,
  type PromoCodeInput,
} from "@/lib/queries/promos";

// Expected data-entry mistakes redirect back with a ?error= code (friendly
// banner) instead of throwing an error production would redact. Same pattern
// as saveTour. (Audit-family fix reused here.)
class PromoFormError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Parses + validates the shared promo form. Throws PromoFormError on a bad field. */
function parseForm(formData: FormData): PromoCodeInput {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code)) throw new PromoFormError("bad_code");

  const discountType = String(formData.get("discount_type") ?? "");
  if (discountType !== "percent" && discountType !== "fixed") throw new PromoFormError("bad_type");

  const rawValue = String(formData.get("discount_value") ?? "").trim();
  if (!rawValue) throw new PromoFormError("bad_value");
  const discountValue = Number(rawValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new PromoFormError("bad_value");
  if (discountType === "percent" && discountValue > 100) throw new PromoFormError("percent_too_big");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const validFrom = String(formData.get("valid_from") ?? "").trim() || null;
  const validUntil = String(formData.get("valid_until") ?? "").trim() || null;
  if (validFrom && !dateRe.test(validFrom)) throw new PromoFormError("bad_date");
  if (validUntil && !dateRe.test(validUntil)) throw new PromoFormError("bad_date");
  if (validFrom && validUntil && validUntil < validFrom) throw new PromoFormError("date_order");

  const rawCap = String(formData.get("usage_cap") ?? "").trim();
  let usageCap: number | null = null;
  if (rawCap) {
    usageCap = Number(rawCap);
    if (!Number.isInteger(usageCap) || usageCap < 1) throw new PromoFormError("bad_cap");
  }

  const scopeTourId = String(formData.get("scope_tour_id") ?? "").trim() || null;

  return {
    code,
    discountType,
    discountValue,
    validFrom,
    validUntil,
    usageCap,
    scopeTourId,
    isActive: formData.get("is_active") === "on",
  };
}

export async function addPromoCode(formData: FormData): Promise<void> {
  // requireAdmin, not requireStaff: a promo code is a standing discount that
  // creates real financial liability (percent/fixed off every future booking
  // it matches, until deactivated or its cap runs out) -- the same class of
  // decision this codebase already gates behind admin everywhere else
  // (refunds, settings, schedule, closeSession). Any guide who can check a
  // guest in could otherwise mint one.
  await requireAdmin();
  let input: PromoCodeInput;
  try {
    input = parseForm(formData);
    if (await promoCodeExists(input.code, null)) throw new PromoFormError("duplicate");
  } catch (err) {
    if (err instanceof PromoFormError) redirect(`/dashboard/promos?error=${err.code}`);
    throw err;
  }
  await createPromoCode(input);
  revalidatePath("/dashboard/promos");
  redirect("/dashboard/promos?saved=1");
}

export async function savePromoCode(id: string, formData: FormData): Promise<void> {
  // requireAdmin, not requireStaff: a promo code is a standing discount that
  // creates real financial liability (percent/fixed off every future booking
  // it matches, until deactivated or its cap runs out) -- the same class of
  // decision this codebase already gates behind admin everywhere else
  // (refunds, settings, schedule, closeSession). Any guide who can check a
  // guest in could otherwise mint one.
  await requireAdmin();
  let input: PromoCodeInput;
  try {
    input = parseForm(formData);
    if (await promoCodeExists(input.code, id)) throw new PromoFormError("duplicate");
  } catch (err) {
    if (err instanceof PromoFormError) redirect(`/dashboard/promos?error=${err.code}`);
    throw err;
  }
  await updatePromoCode(id, input);
  revalidatePath("/dashboard/promos");
  redirect("/dashboard/promos?saved=1");
}

export async function removePromoCode(id: string): Promise<void> {
  // requireAdmin, not requireStaff: a promo code is a standing discount that
  // creates real financial liability (percent/fixed off every future booking
  // it matches, until deactivated or its cap runs out) -- the same class of
  // decision this codebase already gates behind admin everywhere else
  // (refunds, settings, schedule, closeSession). Any guide who can check a
  // guest in could otherwise mint one.
  await requireAdmin();
  const deleted = await deletePromoCode(id);
  revalidatePath("/dashboard/promos");
  // A used code can't be deleted (its bookings reference it) -- tell staff to
  // deactivate instead, rather than silently doing nothing.
  redirect(`/dashboard/promos?${deleted ? "saved=1" : "error=has_bookings"}`);
}
