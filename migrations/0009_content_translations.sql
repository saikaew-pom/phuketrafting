-- Migration number: 0009 	 2026-07-11T14:35:35.674Z

-- Translation cache for MiniMax-generated TH/ZH/RU content (plan §8/§1):
-- EN is canonical and lives on the source row (tours.name, blog_posts.title,
-- etc.); every other locale's translated value is cached here per field so
-- translation never happens synchronously at build/deploy time.
CREATE TABLE content_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL, -- 'tour' | 'blog_post' | 'camp_zone' | ...
  content_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  locale TEXT NOT NULL,
  translated_value TEXT NOT NULL,
  is_stale INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE UNIQUE INDEX idx_content_translations_unique ON content_translations(content_type, content_id, field_name, locale);
