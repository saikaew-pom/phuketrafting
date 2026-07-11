-- Migration number: 0006 	 2026-07-11T14:35:31.960Z

-- category is a fixed array (the 5 content pillars, plan §10) enforced in
-- application code, not a CHECK constraint -- pillar names are content
-- decisions, not schema decisions.
CREATE TABLE blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  cover_image_id TEXT, -- Cloudflare Images id (§1a)
  author TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_blog_posts_published ON blog_posts(is_published, published_at);

-- Replaces the hardcoded REVIEWS array in data.jsx (plan §3).
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_name TEXT NOT NULL,
  guest_place TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL,
  tour_id TEXT REFERENCES tours(id),
  is_published INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
