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

/**
 * Cheapest active nightly rate for one zone -- used for the Landing page
 * camping teaser. Scoped to a single zone id (not a global MIN across all
 * zones) so the "from" price shown always matches the zone whose photo and
 * name the teaser card actually displays.
 */
export async function getMinCampRate(zoneId: string): Promise<number | null> {
  const row = await getDb()
    .prepare("SELECT MIN(price_weekday) AS min_price FROM camp_rates WHERE zone_id = ?1 AND is_active = 1")
    .bind(zoneId)
    .first<{ min_price: number | null }>();
  return row?.min_price ?? null;
}

export interface CampZoneUpdate {
  name: string;
  tagline: string;
  description: string;
  is_active: boolean;
  cover_image_id: string;
  /** Shown in chatbot grounding + blog-ai facts ("sleeps 2-4"), not on the public site (yet). */
  sleeps_label: string;
  sort_order: number;
}

export async function updateCampZone(id: string, update: CampZoneUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE camp_zones
          SET name = ?1, tagline = ?2, description = ?3, is_active = ?4,
              cover_image_id = ?5, sleeps_label = ?6, sort_order = ?7,
              updated_at = unixepoch()
        WHERE id = ?8`
    )
    .bind(
      update.name,
      update.tagline || null,
      update.description || null,
      update.is_active ? 1 : 0,
      update.cover_image_id || null,
      update.sleeps_label || null,
      update.sort_order,
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

/* -------------------------------------------------------------------------
 * Camp units -- the bookable inventory.
 *
 * A zone (Family / Outdoor / Private) is a *product*; a unit is the physical
 * tent a guest actually sleeps in. Camp availability is an overlap check
 * against these rows, NOT a seat counter -- see scheduling.ts's
 * claimCampUnitBooking. That difference is why camping has no equivalent of
 * the tour session generator: there is nothing to generate, the tent either
 * exists or it doesn't, and it's free on a date iff no active booking spans it.
 * ---------------------------------------------------------------------- */

export interface CampUnit {
  id: string;
  zone_id: string;
  name: string;
  occupancy: number;
  is_active: number;
  is_blocked: number;
  block_reason: string | null;
  /**
   * Bookings of ANY status ever attached to this unit -- the same population
   * deleteCampUnit's guard counts, so the UI can hide a Delete button that the
   * server would refuse. Deliberately not filtered to active statuses: the
   * guard isn't about occupancy, it's about not destroying booking history.
   */
  booking_count: number;
}

export async function listCampUnits(zoneId: string): Promise<CampUnit[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT u.id, u.zone_id, u.name, u.occupancy, u.is_active, u.is_blocked, u.block_reason,
              (SELECT COUNT(*) FROM bookings b WHERE b.camp_unit_id = u.id) AS booking_count
         FROM camp_units u
        WHERE u.zone_id = ?1
        ORDER BY u.name`
    )
    .bind(zoneId)
    .all<CampUnit>();
  return results;
}

export async function createCampUnit(zoneId: string, name: string, occupancy: number): Promise<void> {
  // `camp-<uuid8>` matches pickup.ts's id convention -- readable in a day
  // sheet, unlike a bare UUID.
  const id = `camp-${crypto.randomUUID().slice(0, 8)}`;
  await getDb()
    .prepare("INSERT INTO camp_units (id, zone_id, name, occupancy) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, zoneId, name, occupancy)
    .run();
}

export interface CampUnitUpdate {
  name: string;
  occupancy: number;
  is_active: boolean;
}

export async function updateCampUnit(id: string, update: CampUnitUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE camp_units
          SET name = ?1, occupancy = ?2, is_active = ?3, updated_at = unixepoch()
        WHERE id = ?4`
    )
    .bind(update.name, update.occupancy, update.is_active ? 1 : 0, id)
    .run();
}

/**
 * Block or unblock one unit -- the camp equivalent of closing a departure.
 *
 * Blocking does NOT cancel the bookings already on the unit: claimCampUnitBooking
 * refuses new ones and listAvailableCampUnits stops offering it, but existing
 * guests keep their reservation and staff still see them on the day sheet.
 * That's deliberate -- "this tent is out of service" is a statement about
 * future inventory, and silently voiding paid stays is never the right default.
 * Staff cancel those bookings explicitly if that's what they mean.
 */
export async function setCampUnitBlocked(id: string, blocked: boolean, reason: string): Promise<number> {
  const result = await getDb()
    .prepare("UPDATE camp_units SET is_blocked = ?1, block_reason = ?2, updated_at = unixepoch() WHERE id = ?3")
    .bind(blocked ? 1 : 0, blocked ? reason : null, id)
    .run();
  return result.meta.changes;
}

/**
 * Deletes a unit only if no booking has ever referenced it.
 *
 * Guarded DELETE rather than SELECT-then-DELETE for the usual reason (D1 has
 * no BEGIN/COMMIT, so a concurrent booking could land in the gap). The guard
 * is ANY booking, not just active ones: bookings.camp_unit_id is a real FK, so
 * deleting a unit with cancelled/past stays attached would either fail at the
 * constraint or orphan booking history -- and that history is what a refund
 * dispute is argued from. Staff who want a retired-but-booked tent gone from
 * the site uncheck "Active" instead; that's what it's for.
 *
 * Returns false when the unit has bookings so the caller can say so, rather
 * than reporting a silent no-op as success.
 */
export async function deleteCampUnit(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `DELETE FROM camp_units
        WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.camp_unit_id = ?1)`
    )
    .bind(id)
    .run();
  return result.meta.changes > 0;
}
