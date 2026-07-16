import { getDb } from "@/lib/db";

export interface Tour {
  id: string;
  slug: string;
  code: string | null;
  name: string;
  tagline: string | null;
  description: string | null;
  distance_km: number | null;
  duration_label: string | null;
  min_group: number | null;
  max_group: number | null;
  includes: string; // JSON array, stringified
  badge: string | null;
  is_active: number;
  sort_order: number;
  cover_image_id: string | null;
}

export interface TourRate {
  id: string;
  tour_id: string;
  min_age: number;
  max_age: number | null;
  label: string | null;
  price: number;
  counts_toward_capacity: number;
}

/**
 * tours.includes is a TEXT column holding a JSON string array. saveTour()
 * can only ever write a valid array (it JSON.stringifies a filtered string
 * list), but a hand-edited D1 row must degrade to "no bullets", not crash
 * the consumer -- confirmed live: an unguarded JSON.parse of a corrupted
 * row 500s the whole public Landing page. Both the dashboard editor and
 * the Landing page parse through this one guard.
 */
export function parseIncludes(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function listTours(): Promise<Tour[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM tours ORDER BY sort_order, name")
    .all<Tour>();
  return results;
}

export async function getTour(id: string): Promise<Tour | null> {
  return getDb().prepare("SELECT * FROM tours WHERE id = ?1").bind(id).first<Tour>();
}

export async function getTourRates(tourId: string): Promise<TourRate[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM tour_rates WHERE tour_id = ?1 ORDER BY min_age")
    .bind(tourId)
    .all<TourRate>();
  return results;
}

export interface TourUpdate {
  name: string;
  tagline: string;
  description: string;
  badge: string;
  is_active: boolean;
  cover_image_id: string;
  /** null = staff cleared the field, which is a valid state for both. */
  distance_km: number | null;
  duration_label: string;
  min_group: number | null;
  max_group: number | null;
  /** Already JSON-stringified by the caller -- the column is TEXT holding a JSON array. */
  includes: string;
  sort_order: number;
}

export async function updateTour(id: string, update: TourUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE tours
          SET name = ?1, tagline = ?2, description = ?3, badge = ?4,
              is_active = ?5, cover_image_id = ?6, distance_km = ?7,
              duration_label = ?8, min_group = ?9, max_group = ?10,
              includes = ?11, sort_order = ?12, updated_at = unixepoch()
        WHERE id = ?13`
    )
    .bind(
      update.name,
      update.tagline || null,
      update.description || null,
      update.badge || null,
      update.is_active ? 1 : 0,
      update.cover_image_id || null,
      update.distance_km,
      update.duration_label || null,
      update.min_group,
      update.max_group,
      update.includes,
      update.sort_order,
      id
    )
    .run();
}

export async function updateTourRatePrice(rateId: string, price: number): Promise<void> {
  await getDb()
    .prepare("UPDATE tour_rates SET price = ?1 WHERE id = ?2")
    .bind(price, rateId)
    .run();
}
