import { getDb } from "@/lib/db";

export interface CampZone {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sleeps_label: string | null;
  amenities: string; // JSON array, stringified
  is_active: number;
  sort_order: number;
  cover_image_id: string | null;
}

export interface CampRate {
  id: string;
  zone_id: string;
  stay_type: string;
  includes_rafting_km: number | null;
  price_weekday: number;
  price_weekend: number;
  min_nights: number;
  is_active: number;
}

export async function listCampZones(): Promise<CampZone[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM camp_zones ORDER BY sort_order, name")
    .all<CampZone>();
  return results;
}

export async function getCampZone(id: string): Promise<CampZone | null> {
  return getDb().prepare("SELECT * FROM camp_zones WHERE id = ?1").bind(id).first<CampZone>();
}

export async function getCampRates(zoneId: string): Promise<CampRate[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM camp_rates WHERE zone_id = ?1 ORDER BY price_weekday")
    .bind(zoneId)
    .all<CampRate>();
  return results;
}

export interface CampZoneUpdate {
  name: string;
  tagline: string;
  description: string;
  is_active: boolean;
  cover_image_id: string;
}

export async function updateCampZone(id: string, update: CampZoneUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE camp_zones
          SET name = ?1, tagline = ?2, description = ?3, is_active = ?4,
              cover_image_id = ?5, updated_at = unixepoch()
        WHERE id = ?6`
    )
    .bind(
      update.name,
      update.tagline || null,
      update.description || null,
      update.is_active ? 1 : 0,
      update.cover_image_id || null,
      id
    )
    .run();
}

export async function updateCampRatePrices(
  rateId: string,
  priceWeekday: number,
  priceWeekend: number
): Promise<void> {
  await getDb()
    .prepare("UPDATE camp_rates SET price_weekday = ?1, price_weekend = ?2 WHERE id = ?3")
    .bind(priceWeekday, priceWeekend, rateId)
    .run();
}
