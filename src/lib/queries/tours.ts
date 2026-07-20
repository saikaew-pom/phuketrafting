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
  /** Which category this tour belongs to (migration 0020); null = uncategorised. */
  category_id: string | null;
  /** 1 = featured on the homepage (replaces the old PRIMARY_TOUR_IDS constant). */
  show_on_home: number;
  /** 'instant' = uses the booking widget; 'enquire' = routes to the enquiry form. */
  booking_mode: string;
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

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "tour";
}

/** True if a code is already taken (codes are UNIQUE; blank code is allowed and never collides). */
export async function tourCodeExists(code: string): Promise<boolean> {
  if (!code) return false;
  const row = await getDb().prepare("SELECT id FROM tours WHERE code = ?1").bind(code).first<{ id: string }>();
  return row != null;
}

/**
 * Creates a new tour with the two standard age bands (Under-6 free / non-
 * capacity, Adult 6+) so it's immediately priceable and its edit page renders.
 * sort_order = MAX+1 (appended last). The slug carries a random suffix -- it's
 * internal only (tours render as cards, there's no /tour/[slug] page), so it
 * just needs to be UNIQUE, not pretty. Returns the new id to redirect to.
 */
export async function createTour(name: string, code: string | null, adultPrice: number): Promise<string> {
  const db = getDb();
  const id = `tour-${crypto.randomUUID().slice(0, 12)}`;
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  await db.batch([
    db
      // is_active = 0: a new tour has no description/cover/bullets yet, so it
      // starts hidden. Staff fill it in on the edit page, then tick Active.
      .prepare(
        `INSERT INTO tours (id, slug, code, name, is_active, sort_order)
         SELECT ?1, ?2, ?3, ?4, 0, COALESCE(MAX(sort_order), -1) + 1 FROM tours`
      )
      .bind(id, slug, code, name),
    db
      .prepare(
        `INSERT INTO tour_rates (id, tour_id, min_age, max_age, label, price, counts_toward_capacity)
         VALUES (?1, ?2, 0, 5, 'Under 6', 0, 0)`
      )
      .bind(`rate-${crypto.randomUUID().slice(0, 12)}`, id),
    db
      .prepare(
        `INSERT INTO tour_rates (id, tour_id, min_age, max_age, label, price, counts_toward_capacity)
         VALUES (?1, ?2, 6, NULL, 'Adult', ?3, 1)`
      )
      .bind(`rate-${crypto.randomUUID().slice(0, 12)}`, id, adultPrice),
  ]);
  return id;
}

/**
 * Deletes a tour only if it's pristine -- no schedule, no bookings, no promo
 * scoped to it. Anything established is retired with the Active toggle instead,
 * the same history-preserving rule as camp units / promo codes: a tour with a
 * booking anywhere in its past is a record a refund dispute is argued from.
 * When clear, its owned children (rate bands, product images) go in the same
 * batch. Returns 'blocked' so the caller can tell staff to deactivate.
 */
export async function deleteTour(id: string): Promise<"ok" | "blocked"> {
  const db = getDb();
  // Every table that FK-references tours(id) must be covered here, or the final
  // DELETE below hits a FOREIGN KEY constraint (D1 enforces them) and throws --
  // which the action surfaces as a redacted digest instead of the friendly
  // banner. bookings ride via tour_sessions (covered). reviews.tour_id (staff
  // attach a review to a tour) is the one that's easy to miss. tour_rates and
  // product_images are owned and cascaded in the batch below, so they don't block.
  const blocker = await db
    .prepare(
      `SELECT 1 WHERE
          EXISTS (SELECT 1 FROM tour_sessions WHERE tour_id = ?1)
       OR EXISTS (SELECT 1 FROM session_templates WHERE tour_id = ?1)
       OR EXISTS (SELECT 1 FROM promo_codes WHERE scope_tour_id = ?1)
       OR EXISTS (SELECT 1 FROM reviews WHERE tour_id = ?1)
       -- availability_audit.tour_id (migration 0019) landed after this list was
       -- written and was never added to it. It has no ON DELETE clause, so it
       -- blocks the DELETE below exactly like the others: a tour whose sessions
       -- and templates have all been removed, but which was once the subject of
       -- one bulk availability operation, passed this check and then threw
       -- FOREIGN KEY constraint failed inside the batch. deleteTourAction has no
       -- try/catch, so staff got dashboard/error.tsx's opaque digest instead of
       -- the has_activity banner this function exists to produce, and the tour
       -- was undeletable with no stated reason.
       OR EXISTS (SELECT 1 FROM availability_audit WHERE tour_id = ?1)`
    )
    .bind(id)
    .first();
  if (blocker) return "blocked";

  await db.batch([
    db.prepare("DELETE FROM tour_rates WHERE tour_id = ?1").bind(id),
    db.prepare("DELETE FROM product_images WHERE owner_type = 'tour' AND owner_id = ?1").bind(id),
    db.prepare("DELETE FROM tours WHERE id = ?1").bind(id),
  ]);
  return "ok";
}

/** Reorders a tour one slot earlier/later, swapping sort_order with its neighbour, atomically. */
export async function moveTour(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db.prepare("SELECT sort_order FROM tours WHERE id = ?1").bind(id).first<{ sort_order: number }>();
  if (!row) return;
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(`SELECT id, sort_order FROM tours WHERE sort_order ${cmp} ?1 ORDER BY sort_order ${order} LIMIT 1`)
    .bind(row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return;
  await db.batch([
    db.prepare("UPDATE tours SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE tours SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}

export async function getTourRates(tourId: string): Promise<TourRate[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM tour_rates WHERE tour_id = ?1 ORDER BY min_age")
    .bind(tourId)
    .all<TourRate>();
  return results;
}

/**
 * Every rate row in one query, for callers that need prices for MANY tours at
 * once (the homepage, which prices each featured tour). Calling getTourRates()
 * per tour was one D1 round trip per card -- fine at the old hardcoded three,
 * but it grew with however many tours staff feature. tour_rates holds ~2 rows
 * per tour, so reading the table whole and grouping in JS is cheaper than N
 * queries. Same shape as listTourReviewStats(): return rows, let the caller
 * build its own Map.
 */
export async function listAllTourRates(): Promise<TourRate[]> {
  const { results } = await getDb()
    .prepare("SELECT * FROM tour_rates ORDER BY tour_id, min_age")
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
  /** "" = uncategorised (stored as null). (Migration 0020.) */
  category_id: string;
  show_on_home: boolean;
  /** 'instant' | 'enquire' -- caller validates against the two allowed values. */
  booking_mode: string;
}

export async function updateTour(id: string, update: TourUpdate): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE tours
          SET name = ?1, tagline = ?2, description = ?3, badge = ?4,
              is_active = ?5, cover_image_id = ?6, distance_km = ?7,
              duration_label = ?8, min_group = ?9, max_group = ?10,
              includes = ?11, sort_order = ?12,
              category_id = ?13, show_on_home = ?14, booking_mode = ?15,
              updated_at = unixepoch()
        WHERE id = ?16`
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
      update.category_id || null,
      update.show_on_home ? 1 : 0,
      update.booking_mode,
      id
    )
    .run();
}

// tourId scopes the update: without it, any rate-<id> key in the POST could
// reprice a DIFFERENT tour's rate row (staff-only, so not an auth hole, but a
// crafted/stale form would silently mis-price another tour and skip its
// revalidation). (Audit A24.)
export async function updateTourRatePrice(rateId: string, tourId: string, price: number): Promise<void> {
  await getDb()
    .prepare("UPDATE tour_rates SET price = ?1 WHERE id = ?2 AND tour_id = ?3")
    .bind(price, rateId, tourId)
    .run();
}
