import { getDb } from "@/lib/db";

/**
 * Tour categories (migration 0020) -- the real grouping that lets staff add a
 * whole new KIND of tour (Island Tours, Trekking) as data, not code. The
 * homepage renders active categories in order, each with its featured tours;
 * assigning a tour to a category + ticking "show on homepage" is all it takes
 * for a new section to appear. Same guarded-CRUD shape as tours/add-ons.
 */
export interface TourCategory {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  cover_image_id: string | null;
  is_active: number;
  sort_order: number;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
}

export async function listTourCategories(): Promise<TourCategory[]> {
  const { results } = await getDb()
    .prepare("SELECT id, slug, name, tagline, cover_image_id, is_active, sort_order FROM tour_categories ORDER BY sort_order, name")
    .all<TourCategory>();
  return results;
}

export async function getTourCategory(id: string): Promise<TourCategory | null> {
  return getDb()
    .prepare("SELECT id, slug, name, tagline, cover_image_id, is_active, sort_order FROM tour_categories WHERE id = ?1")
    .bind(id)
    .first<TourCategory>();
}

/** Appended last (sort_order = MAX+1). Slug carries a random suffix -- it only needs to be UNIQUE. */
export async function createTourCategory(name: string, tagline: string): Promise<string> {
  const id = `cat-${crypto.randomUUID().slice(0, 12)}`;
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  await getDb()
    .prepare(
      `INSERT INTO tour_categories (id, slug, name, tagline, is_active, sort_order)
       SELECT ?1, ?2, ?3, ?4, 1, COALESCE(MAX(sort_order), -1) + 1 FROM tour_categories`
    )
    .bind(id, slug, name, tagline || null)
    .run();
  return id;
}

export async function updateTourCategory(
  id: string,
  name: string,
  tagline: string,
  coverImageId: string,
  isActive: boolean
): Promise<void> {
  await getDb()
    .prepare(
      "UPDATE tour_categories SET name = ?1, tagline = ?2, cover_image_id = ?3, is_active = ?4, updated_at = unixepoch() WHERE id = ?5"
    )
    .bind(name, tagline || null, coverImageId || null, isActive ? 1 : 0, id)
    .run();
}

/**
 * Deletes a category only if no tour is assigned to it -- a category with tours
 * is retired with the Active toggle instead, and the FK would block the delete
 * anyway (D1 enforces FKs). Returns false so the caller can say "move its tours
 * first".
 */
export async function deleteTourCategory(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare("DELETE FROM tour_categories WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM tours WHERE category_id = ?1)")
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

/** Reorders a category one slot, swapping sort_order with its neighbour, atomically. */
export async function moveTourCategory(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db.prepare("SELECT sort_order FROM tour_categories WHERE id = ?1").bind(id).first<{ sort_order: number }>();
  if (!row) return;
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(`SELECT id, sort_order FROM tour_categories WHERE sort_order ${cmp} ?1 ORDER BY sort_order ${order} LIMIT 1`)
    .bind(row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return;
  await db.batch([
    db.prepare("UPDATE tour_categories SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE tour_categories SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}
