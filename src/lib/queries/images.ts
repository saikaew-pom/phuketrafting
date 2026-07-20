import { getDb } from "@/lib/db";

/**
 * The product_images collection (migration 0016): the homepage gallery
 * (ownerType 'gallery', ownerId null) and supplementary images per tour /
 * camp_zone. Cloudinary public_ids only -- URLs are built by lib/cloudinary.ts.
 */

export type ImageOwnerType = "gallery" | "tour" | "camp_zone";

export interface ProductImage {
  id: string;
  owner_type: ImageOwnerType;
  owner_id: string | null;
  image_id: string;
  label: string | null;
  sort_order: number;
  /** Gallery-only in practice (migration 0022) -- always 1 for tour/camp_zone rows, unused there. */
  show_on_home: number;
}

/**
 * All images for one owner, in display order, INCLUDING gallery photos
 * hidden from the homepage (show_on_home=0) -- the dashboard list must show
 * everything staff manage, not just what's currently public. Gallery =
 * ('gallery', null).
 */
export async function listImages(ownerType: ImageOwnerType, ownerId: string | null): Promise<ProductImage[]> {
  // owner_id is nullable, so "= ?" won't match NULL -- the IS-NULL branch
  // handles the gallery, the bound branch handles a product.
  const db = getDb();
  const { results } =
    ownerId === null
      ? await db
          .prepare(
            "SELECT id, owner_type, owner_id, image_id, label, sort_order, show_on_home FROM product_images WHERE owner_type = ?1 AND owner_id IS NULL ORDER BY sort_order, created_at"
          )
          .bind(ownerType)
          .all<ProductImage>()
      : await db
          .prepare(
            "SELECT id, owner_type, owner_id, image_id, label, sort_order, show_on_home FROM product_images WHERE owner_type = ?1 AND owner_id = ?2 ORDER BY sort_order, created_at"
          )
          .bind(ownerType, ownerId)
          .all<ProductImage>();
  return results;
}

/**
 * Appends an image at the end of the owner's list. New sort_order is
 * MAX(existing) + 1 in one guarded statement (no read-then-write race): the
 * SELECT is a subquery inside the INSERT, so concurrent adds can't collide on
 * a duplicate order the way a separate count()+insert would.
 */
export async function addImage(
  ownerType: ImageOwnerType,
  ownerId: string | null,
  imageId: string,
  label: string | null
): Promise<void> {
  const id = `img-${crypto.randomUUID().slice(0, 12)}`;
  await getDb()
    .prepare(
      `INSERT INTO product_images (id, owner_type, owner_id, image_id, label, sort_order)
       SELECT ?1, ?2, ?3, ?4, ?5,
              COALESCE(MAX(sort_order), -1) + 1
         FROM product_images
        WHERE owner_type = ?2 AND (owner_id = ?6 OR (?6 IS NULL AND owner_id IS NULL))`
    )
    .bind(id, ownerType, ownerId, imageId, label || null, ownerId)
    .run();
}

/** Overwrites an image's caption/alt text. */
export async function updateImageLabel(id: string, label: string | null): Promise<void> {
  await getDb().prepare("UPDATE product_images SET label = ?1 WHERE id = ?2").bind(label, id).run();
}

/** Toggles whether a gallery photo appears in the homepage teaser strip. */
export async function setImageShowOnHome(id: string, show: boolean): Promise<void> {
  await getDb()
    .prepare("UPDATE product_images SET show_on_home = ?1 WHERE id = ?2")
    .bind(show ? 1 : 0, id)
    .run();
}

/** Removes one image. Returns whether a row was actually deleted. */
export async function deleteImage(id: string): Promise<boolean> {
  const result = await getDb().prepare("DELETE FROM product_images WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}

/** Nudges an image one slot earlier/later, swapping sort_order with its neighbour, atomically. */
export async function moveImage(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db
    .prepare("SELECT owner_type, owner_id, sort_order FROM product_images WHERE id = ?1")
    .bind(id)
    .first<{ owner_type: string; owner_id: string | null; sort_order: number }>();
  if (!row) return;

  // The adjacent image in the chosen direction, within the SAME owner.
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(
      `SELECT id, sort_order FROM product_images
        WHERE owner_type = ?1
          AND (owner_id = ?2 OR (?2 IS NULL AND owner_id IS NULL))
          AND sort_order ${cmp} ?3
        ORDER BY sort_order ${order}
        LIMIT 1`
    )
    .bind(row.owner_type, row.owner_id, row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return; // already at the end/start

  // Swap the two sort_orders in one batch (one transaction), so a reader can
  // never see both rows sharing an order or neither holding it.
  await db.batch([
    db.prepare("UPDATE product_images SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE product_images SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}
