-- Migration number: 0022 	 2026-07-20T11:00:00.000Z

-- Per-photo control over whether a gallery photo appears in the homepage
-- teaser strip. Defaults to 1 (shown) so every existing photo keeps
-- appearing exactly as it does today -- the opposite default from
-- tours.show_on_home (migration 0020), which opts IN because homepage tour
-- placement was a brand-new curated feature with nothing shown yet. Hiding a
-- photo that's already live would be a real regression, not a blank slate.
--
-- Only meaningful for owner_type='gallery' rows -- tour/camp_zone "more
-- photos" aren't rendered on the homepage at all today, so the column is
-- simply unused (always its default) for those, same as `label` already is
-- effectively gallery-only in practice despite living on the shared table.
ALTER TABLE product_images ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 1;
