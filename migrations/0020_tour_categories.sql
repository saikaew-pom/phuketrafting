-- Migration number: 0020 	 2026-07-18T14:00:00.000Z

-- Future-proof the tours model so adding a whole new KIND of tour (trekking,
-- James Bond Island, Phi Phi) is a dashboard operation, never a code edit.
-- Before this, "which tours show on the homepage" was a hardcoded constant
-- (PRIMARY_TOUR_IDS = tour-b1/b2/b3) and there was no grouping at all -- tours
-- were a flat list whose only relationship was in their name text.
--
-- Three additions make it data-driven:
--   1. tour_categories: the real grouping (Rafting, Island Tours, Trekking...)
--   2. tours.category_id: which group a tour belongs to
--   3. tours.show_on_home: staff choose homepage tours (replaces the constant)
--   4. tours.booking_mode: 'instant' = uses the booking widget; 'enquire' =
--      routes to the enquiry form (private charters, on-request day trips)
CREATE TABLE tour_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  -- Cloudinary public_id for the category's homepage section, optional.
  cover_image_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- category_id is nullable: a tour can exist un-categorised (it just won't
-- render under any homepage section until staff assign it). NOT a NOT NULL, so
-- the backfill below and future tour creation never fail on ordering.
ALTER TABLE tours ADD COLUMN category_id TEXT REFERENCES tour_categories(id);
-- Replaces the PRIMARY_TOUR_IDS constant. Default 0: a brand-new tour starts
-- off the homepage until staff choose to feature it (same spirit as is_active).
ALTER TABLE tours ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 0;
-- Default 'instant' keeps every existing tour bookable exactly as today.
ALTER TABLE tours ADD COLUMN booking_mode TEXT NOT NULL DEFAULT 'instant'
  CHECK (booking_mode IN ('instant','enquire'));

-- Backfill so the live site is visually unchanged after this migration:
-- one "Rafting & Ziplines" category holding every current tour, and B1/B2/B3
-- flagged onto the homepage exactly as PRIMARY_TOUR_IDS had them.
INSERT INTO tour_categories (id, slug, name, tagline, sort_order)
  VALUES ('cat-rafting', 'rafting', 'Rafting & Ziplines',
          'White-water rafting, ziplines and ATV adventures through the wild heart of Phang Nga.', 0);
UPDATE tours SET category_id = 'cat-rafting';
UPDATE tours SET show_on_home = 1 WHERE id IN ('tour-b1', 'tour-b2', 'tour-b3');
