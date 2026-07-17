-- Migration number: 0016 	 2026-07-17T08:00:00.000Z

-- One image collection for three owners: the site gallery (owner_type
-- 'gallery', owner_id NULL) that the homepage renders, and multiple images per
-- tour / camp_zone. Stores Cloudinary public_ids only -- delivery URLs are
-- built on demand by lib/cloudinary.ts, the same "store the id" pattern as
-- blog_posts.cover_image_id and the cover_image_id columns added in 0010.
--
-- The single-column cover_image_id on tours/camp_zones (migration 0010) stays
-- as the canonical cover -- this table is the SUPPLEMENTARY set. A product's
-- cover is still edited on its own page; this holds the rest. The gallery has
-- no separate cover concept, so is_cover is only meaningful for products.
CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  -- 'gallery' = the homepage strip (owner_id NULL); 'tour'/'camp_zone' key a
  -- product row. A CHECK, not an FK, because owner_id spans two tables (and is
  -- NULL for the gallery) -- orphan cleanup is the deleting screen's job.
  owner_type TEXT NOT NULL CHECK (owner_type IN ('gallery', 'tour', 'camp_zone')),
  owner_id TEXT,
  image_id TEXT NOT NULL,        -- Cloudinary public_id
  label TEXT,                    -- alt text / caption (the gallery shows it)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- The one read pattern: all images for an owner, in display order. owner_id is
-- part of the key so the gallery (NULL) and each product select cleanly.
CREATE INDEX idx_product_images_owner ON product_images(owner_type, owner_id, sort_order);
