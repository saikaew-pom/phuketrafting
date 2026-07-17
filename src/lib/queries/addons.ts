import { getDb } from "@/lib/db";

/** Priced add-ons catalog (migration 0018). Global, flat price per booking. */
export interface Addon {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: number;
  sort_order: number;
}

/** Active add-ons in display order -- the public widget + pricing. */
export async function listActiveAddons(): Promise<Addon[]> {
  const { results } = await getDb()
    .prepare("SELECT id, name, description, price, is_active, sort_order FROM addons WHERE is_active = 1 ORDER BY sort_order, name")
    .all<Addon>();
  return results;
}

/** All add-ons (active + hidden) for the dashboard. */
export async function listAllAddons(): Promise<Addon[]> {
  const { results } = await getDb()
    .prepare("SELECT id, name, description, price, is_active, sort_order FROM addons ORDER BY sort_order, name")
    .all<Addon>();
  return results;
}

/**
 * Hard ceiling on how many distinct add-on ids one booking can resolve. Bounds
 * the IN(...) placeholder list so a hostile direct POST with a huge id array
 * can't build an oversized query that trips D1's bound-parameter limit and 500s
 * -- same "cap the untrusted count" stance as the camp MAX_STAY_NIGHTS guard
 * (Audit A2). Far above any real catalog size, so it never clips a genuine pick.
 */
const MAX_ADDONS_PER_BOOKING = 50;

/**
 * Resolves a set of add-on ids to their AUTHORITATIVE rows (active only). The
 * trust anchor for pricing: the widget sends ids (a claim); the price and name
 * come from D1 here, never from the client. A deactivated or unknown id is
 * silently dropped -- a guest can't apply a retired add-on. De-duplicated so a
 * repeated id can't be charged twice, and capped so an oversized id list can't
 * blow the query up.
 */
export async function getActiveAddonsByIds(ids: string[]): Promise<Addon[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_ADDONS_PER_BOOKING);
  if (unique.length === 0) return [];
  const placeholders = unique.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await getDb()
    .prepare(
      `SELECT id, name, description, price, is_active, sort_order
         FROM addons WHERE is_active = 1 AND id IN (${placeholders}) ORDER BY sort_order, name`
    )
    .bind(...unique)
    .all<Addon>();
  return results;
}

/**
 * A negative price would act as a stealth discount -- it subtracts from the
 * booking total and so from the 25% deposit. Reject it at the app layer (the DB
 * also has a CHECK, but this gives the CMS a clean boolean rather than a thrown
 * constraint). Returns false so the action can show "price can't be negative".
 */
export async function createAddon(name: string, description: string, price: number): Promise<boolean> {
  if (!Number.isFinite(price) || price < 0) return false;
  const id = `addon-${crypto.randomUUID().slice(0, 12)}`;
  await getDb()
    .prepare(
      `INSERT INTO addons (id, name, description, price, sort_order)
       SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(sort_order), -1) + 1 FROM addons`
    )
    .bind(id, name, description || null, price)
    .run();
  return true;
}

export async function updateAddon(
  id: string,
  name: string,
  description: string,
  price: number,
  isActive: boolean
): Promise<boolean> {
  if (!Number.isFinite(price) || price < 0) return false;
  const result = await getDb()
    .prepare(
      "UPDATE addons SET name = ?1, description = ?2, price = ?3, is_active = ?4, updated_at = unixepoch() WHERE id = ?5"
    )
    .bind(name, description || null, price, isActive ? 1 : 0, id)
    .run();
  return result.meta.changes > 0;
}

/**
 * Deletes an add-on only if no booking bought it. A purchased add-on is
 * deactivated, not deleted -- booking_addons snapshots its name/price so the
 * history survives, but the addon_id FK would still block a hard delete, and
 * keeping the catalog row lets reports join back to it. Returns false when it
 * has bookings so the caller can say "deactivate instead".
 */
export async function deleteAddon(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare("DELETE FROM addons WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM booking_addons WHERE addon_id = ?1)")
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function moveAddon(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db.prepare("SELECT sort_order FROM addons WHERE id = ?1").bind(id).first<{ sort_order: number }>();
  if (!row) return;
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(`SELECT id, sort_order FROM addons WHERE sort_order ${cmp} ?1 ORDER BY sort_order ${order} LIMIT 1`)
    .bind(row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return;
  await db.batch([
    db.prepare("UPDATE addons SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE addons SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}

/** Add-ons a booking bought, from the snapshot (survives catalog edits/deletes). */
export interface BookingAddon {
  name_at_booking: string;
  price_at_booking: number;
}
export async function listBookingAddons(bookingId: string): Promise<BookingAddon[]> {
  const { results } = await getDb()
    .prepare("SELECT name_at_booking, price_at_booking FROM booking_addons WHERE booking_id = ?1 ORDER BY created_at")
    .bind(bookingId)
    .all<BookingAddon>();
  return results;
}
