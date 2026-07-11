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
}

export async function updateTour(id: string, update: TourUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE tours
          SET name = ?1, tagline = ?2, description = ?3, badge = ?4,
              is_active = ?5, cover_image_id = ?6, updated_at = unixepoch()
        WHERE id = ?7`
    )
    .bind(
      update.name,
      update.tagline || null,
      update.description || null,
      update.badge || null,
      update.is_active ? 1 : 0,
      update.cover_image_id || null,
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
