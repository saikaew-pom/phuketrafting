import { getDb } from "@/lib/db";

export interface PickupZone {
  id: string;
  name: string;
  fee: number;
  earliest_pickup_time: string | null;
}

export async function listPickupZones(): Promise<PickupZone[]> {
  const { results } = await getDb()
    .prepare("SELECT id, name, fee, earliest_pickup_time FROM pickup_zones WHERE is_active = 1 ORDER BY sort_order, name")
    .all<PickupZone>();
  return results;
}

// -- Dashboard CRUD (CMS coverage audit: `fee` is real money charged to
// guests and also feeds the chatbot's grounding, but had no staff write path).

export interface PickupZoneRow extends PickupZone {
  is_active: number;
  sort_order: number;
}

export async function listAllPickupZones(): Promise<PickupZoneRow[]> {
  const { results } = await getDb()
    .prepare("SELECT id, name, fee, earliest_pickup_time, is_active, sort_order FROM pickup_zones ORDER BY sort_order, name")
    .all<PickupZoneRow>();
  return results;
}

export async function getPickupZone(id: string): Promise<PickupZoneRow | null> {
  return getDb()
    .prepare("SELECT id, name, fee, earliest_pickup_time, is_active, sort_order FROM pickup_zones WHERE id = ?1")
    .bind(id)
    .first<PickupZoneRow>();
}

export interface PickupZoneInput {
  name: string;
  fee: number;
  earliest_pickup_time: string;
  is_active: boolean;
  sort_order: number;
}

export async function createPickupZone(input: PickupZoneInput): Promise<string> {
  // App-generated id, same PK strategy as every staff-created row.
  const id = `pickup-${crypto.randomUUID().slice(0, 8)}`;
  await getDb()
    .prepare(
      `INSERT INTO pickup_zones (id, name, fee, earliest_pickup_time, is_active, sort_order)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(id, input.name, input.fee, input.earliest_pickup_time || null, input.is_active ? 1 : 0, input.sort_order)
    .run();
  return id;
}

/** Returns whether a row matched -- same convention as blog.ts's updatePost. */
export async function updatePickupZone(id: string, input: PickupZoneInput): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE pickup_zones
          SET name = ?1, fee = ?2, earliest_pickup_time = ?3, is_active = ?4, sort_order = ?5
        WHERE id = ?6`
    )
    .bind(input.name, input.fee, input.earliest_pickup_time || null, input.is_active ? 1 : 0, input.sort_order, id)
    .run();
  return result.meta.changes > 0;
}

// No deletePickupZone on purpose: bookings.pickup_zone_id references these
// rows, and deleting a zone would orphan every historical booking that used
// it. Deactivating (is_active = 0) hides it from guests while history keeps
// resolving -- same soft-delete stance as tours/camp zones.
