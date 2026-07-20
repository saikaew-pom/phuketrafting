-- Migration number: 0021 	 2026-07-20T09:00:00.000Z

-- Staff-managed tag list + many-to-many assignment to product_images. Unlike
-- tour_categories (one category per tour, a plain FK column on the tour), a
-- photo can carry several tags at once -- a genuine join table, no existing
-- precedent in this schema to reuse.
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- product_image_id, not image_id: product_images already has a column
-- literally called image_id (the Cloudinary public_id) -- naming the FK
-- anything else avoids a confusing "which image_id" collision between tables.
--
-- ON DELETE CASCADE both directions: deleting a tag just untags whatever had
-- it (a lightweight, disposable taxonomy -- nothing should block removing
-- one, unlike tour_categories' deliberate "can't delete while in use"), and
-- deleting a photo drops its tag rows with it instead of leaving orphans.
CREATE TABLE image_tags (
  product_image_id TEXT NOT NULL REFERENCES product_images(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_image_id, tag_id)
) STRICT;

-- The PK already covers "every tag on photo X" (product_image_id is its
-- leftmost column). This covers the reverse lookup, "every photo with tag Y"
-- -- needed by the public gallery's tag filter (a later stage).
CREATE INDEX idx_image_tags_tag ON image_tags(tag_id);
