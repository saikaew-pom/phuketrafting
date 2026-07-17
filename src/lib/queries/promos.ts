import { getDb } from "@/lib/db";

/**
 * Promo-code issuance (plan §2 -- the redemption engine in pricing.ts/booking.ts
 * existed since Phase 1, but there was no way to CREATE codes). valid_from /
 * valid_until are YYYY-MM-DD text compared lexically to "today" by
 * lookupPromoCode -- keep that format here.
 */
export interface PromoCode {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  usage_cap: number | null;
  usage_count: number;
  scope_tour_id: string | null;
  is_active: number;
}

export interface PromoCodeInput {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  validFrom: string | null;
  validUntil: string | null;
  usageCap: number | null;
  scopeTourId: string | null;
  isActive: boolean;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, code, discount_type, discount_value, valid_from, valid_until,
              usage_cap, usage_count, scope_tour_id, is_active
         FROM promo_codes ORDER BY is_active DESC, created_at DESC`
    )
    .all<PromoCode>();
  return results;
}

export async function getPromoCode(id: string): Promise<PromoCode | null> {
  return getDb()
    .prepare(
      `SELECT id, code, discount_type, discount_value, valid_from, valid_until,
              usage_cap, usage_count, scope_tour_id, is_active
         FROM promo_codes WHERE id = ?1`
    )
    .bind(id)
    .first<PromoCode>();
}

/** True if a code already exists (case-insensitive isn't needed -- codes are stored uppercased). */
export async function promoCodeExists(code: string, excludeId: string | null): Promise<boolean> {
  const row = await getDb().prepare("SELECT id FROM promo_codes WHERE code = ?1").bind(code).first<{ id: string }>();
  return row != null && row.id !== excludeId;
}

export async function createPromoCode(input: PromoCodeInput): Promise<void> {
  const id = `promo-${crypto.randomUUID().slice(0, 12)}`;
  await getDb()
    .prepare(
      `INSERT INTO promo_codes (id, code, discount_type, discount_value, valid_from, valid_until, usage_cap, scope_tour_id, is_active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(
      id,
      input.code,
      input.discountType,
      input.discountValue,
      input.validFrom,
      input.validUntil,
      input.usageCap,
      input.scopeTourId,
      input.isActive ? 1 : 0
    )
    .run();
}

/** Updates everything except usage_count (that's the redemption engine's, never edited by hand). */
export async function updatePromoCode(id: string, input: PromoCodeInput): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE promo_codes
          SET code = ?1, discount_type = ?2, discount_value = ?3, valid_from = ?4,
              valid_until = ?5, usage_cap = ?6, scope_tour_id = ?7, is_active = ?8
        WHERE id = ?9`
    )
    .bind(
      input.code,
      input.discountType,
      input.discountValue,
      input.validFrom,
      input.validUntil,
      input.usageCap,
      input.scopeTourId,
      input.isActive ? 1 : 0,
      id
    )
    .run();
  return result.meta.changes > 0;
}

/**
 * Deletes a code only if no booking has ever recorded it (bookings.promo_code_id
 * is a real FK). A used code is deactivated, not deleted -- the same "don't
 * destroy the history a dispute is argued from" rule as camp units. Guarded
 * DELETE so a concurrent redemption can't slip in. Returns false when it has
 * bookings, so the caller can say to deactivate instead.
 */
export async function deletePromoCode(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `DELETE FROM promo_codes
        WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.promo_code_id = ?1)`
    )
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
