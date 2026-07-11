-- Migration number: 0010 	 2026-07-11T19:45:55.186Z

-- Cloudinary public_id (not a URL -- delivery URLs are constructed on demand
-- via lib/cloudinary.ts, same "store the ID" pattern as blog_posts.cover_image_id).
-- Plain nullable TEXT with no default -- D1/SQLite's ADD COLUMN forbids
-- CURRENT_TIMESTAMP-style dynamic defaults, but a defaultless nullable
-- column is unrestricted.
ALTER TABLE tours ADD COLUMN cover_image_id TEXT;
ALTER TABLE camp_zones ADD COLUMN cover_image_id TEXT;
