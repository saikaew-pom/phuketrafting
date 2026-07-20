import { getDb } from "@/lib/db";
import type { ProductImage } from "@/lib/queries/images";

/**
 * Staff-managed tags (migration 0021) + their many-to-many assignment to
 * product_images, via image_tags. Same guarded-CRUD shape as
 * tour-categories.ts, minus the "can't delete while in use" guard -- a tag is
 * a lightweight, disposable label (ON DELETE CASCADE untags on delete), not a
 * structural relationship like a tour's category.
 */

export interface Tag {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface TagWithCount extends Tag {
  usageCount: number;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "tag"
  );
}

export async function listTags(): Promise<Tag[]> {
  const { results } = await getDb().prepare("SELECT id, slug, name, sort_order FROM tags ORDER BY sort_order, name").all<Tag>();
  return results;
}

/** For the Tags management screen -- how many photos each tag is actually used on. */
export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT t.id, t.slug, t.name, t.sort_order, COUNT(it.product_image_id) AS usageCount
       FROM tags t
       LEFT JOIN image_tags it ON it.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.sort_order, t.name`
    )
    .all<TagWithCount>();
  return results;
}

/** Appended last (sort_order = MAX+1). Slug carries a random suffix -- it only needs to be UNIQUE. */
export async function createTag(name: string): Promise<string> {
  const id = `tag-${crypto.randomUUID().slice(0, 12)}`;
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  await getDb()
    .prepare(`INSERT INTO tags (id, slug, name, sort_order) SELECT ?1, ?2, ?3, COALESCE(MAX(sort_order), -1) + 1 FROM tags`)
    .bind(id, slug, name)
    .run();
  return id;
}

export async function renameTag(id: string, name: string): Promise<void> {
  await getDb().prepare("UPDATE tags SET name = ?1 WHERE id = ?2").bind(name, id).run();
}

/** Cascades to image_tags automatically (ON DELETE CASCADE) -- untags every photo that had it. */
export async function deleteTag(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM tags WHERE id = ?1").bind(id).run();
}

/** Reorders a tag one slot, swapping sort_order with its neighbour, atomically. */
export async function moveTag(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db.prepare("SELECT sort_order FROM tags WHERE id = ?1").bind(id).first<{ sort_order: number }>();
  if (!row) return;
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(`SELECT id, sort_order FROM tags WHERE sort_order ${cmp} ?1 ORDER BY sort_order ${order} LIMIT 1`)
    .bind(row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return;
  await db.batch([
    db.prepare("UPDATE tags SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE tags SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}

// D1 caps bound parameters at 100 per query (Cloudflare D1 platform limits --
// https://developers.cloudflare.com/d1/platform/limits/). Confirmed live: with
// 151 ids in the IN(...) list (one bound parameter each), this query threw and
// the whole Gallery dashboard page 500'd (getImageTagsBatch is awaited
// unguarded in the page's data-fetching, so the failure wasn't scoped to
// tags). Production has 38 gallery photos today, comfortably under this, but
// the gallery is meant to grow -- chunking now means crossing 100 photos
// degrades to a few extra queries instead of taking the whole screen down.
const D1_MAX_BOUND_PARAMS = 100;

/**
 * Every tag for a SET of photos, grouped by photo id -- the gallery list
 * screen needs this per row without an N+1 query per photo. One query per
 * chunk of <= 100 ids (see D1_MAX_BOUND_PARAMS), not one query per photo --
 * for every gallery size seen in practice today this is still exactly one
 * query, same as before chunking was added.
 */
export async function getImageTagsBatch(productImageIds: string[]): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  if (productImageIds.length === 0) return map;

  const db = getDb();
  for (let i = 0; i < productImageIds.length; i += D1_MAX_BOUND_PARAMS) {
    const chunk = productImageIds.slice(i, i + D1_MAX_BOUND_PARAMS);
    const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
    const { results } = await db
      .prepare(
        `SELECT it.product_image_id, t.id, t.slug, t.name, t.sort_order
         FROM tags t
         JOIN image_tags it ON it.tag_id = t.id
         WHERE it.product_image_id IN (${placeholders})
         ORDER BY t.sort_order, t.name`
      )
      .bind(...chunk)
      .all<{ product_image_id: string; id: string; slug: string; name: string; sort_order: number }>();

    for (const row of results) {
      const list = map.get(row.product_image_id) ?? [];
      list.push({ id: row.id, slug: row.slug, name: row.name, sort_order: row.sort_order });
      map.set(row.product_image_id, list);
    }
  }
  return map;
}

/**
 * Gallery photos carrying a given tag, by the tag's slug -- for the public
 * /gallery page's tag filter (a URL like /en/gallery?tag=rafting). A slug
 * that matches no tag (a stale bookmark after a rename, or a typo) degrades
 * to an empty list rather than throwing -- same "bad input never 500s a
 * public page" stance as this app's other public queries.
 */
export async function listImagesByTagSlug(tagSlug: string): Promise<ProductImage[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT pi.id, pi.owner_type, pi.owner_id, pi.image_id, pi.label, pi.sort_order, pi.show_on_home
       FROM product_images pi
       JOIN image_tags it ON it.product_image_id = pi.id
       JOIN tags t ON t.id = it.tag_id
       WHERE t.slug = ?1 AND pi.owner_type = 'gallery'
       ORDER BY pi.sort_order, pi.created_at`
    )
    .bind(tagSlug)
    .all<ProductImage>();
  return results;
}

/**
 * Replaces ALL of one photo's tags with exactly this set -- simplest
 * semantics for a checkbox/chip UI (staff toggles tags, each toggle submits
 * the full resulting set), no old/new diff to compute.
 *
 * db.batch(), not sequential: delete-then-insert must land together. A photo
 * caught between the DELETE and the INSERTs (a mid-request failure) would
 * otherwise be observably tagless -- same "a half-applied write is a real bad
 * state" reasoning as settings.ts's writePolicies/writeAppearance.
 */
export async function setImageTags(productImageId: string, tagIds: string[]): Promise<void> {
  const db = getDb();
  const statements = [db.prepare("DELETE FROM image_tags WHERE product_image_id = ?1").bind(productImageId)];
  for (const tagId of tagIds) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO image_tags (product_image_id, tag_id) VALUES (?1, ?2)").bind(productImageId, tagId)
    );
  }
  await db.batch(statements);
}
