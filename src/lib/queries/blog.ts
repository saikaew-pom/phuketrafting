import { getDb } from "@/lib/db";

/**
 * Fixed category array (plan §3: "category from fixed array", §10: "five
 * content pillars"). Enforced in application code, not a CHECK constraint --
 * same choice migration 0006 documents, since pillar names are a content
 * decision, not a schema one.
 */
export const BLOG_CATEGORIES = [
  { id: "rafting", label: "White-Water Rafting" },
  { id: "jungle-adventures", label: "Jungle Adventures" },
  { id: "trip-planning", label: "Trip Planning & Logistics" },
  { id: "camping", label: "Riverside Camping & Glamping" },
  { id: "nature-culture", label: "Nature, Culture & Responsible Travel" },
] as const;

export type BlogCategoryId = (typeof BLOG_CATEGORIES)[number]["id"];

export function isBlogCategory(value: string): value is BlogCategoryId {
  return BLOG_CATEGORIES.some((c) => c.id === value);
}

export function categoryLabel(id: string): string {
  return BLOG_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export interface BlogPost {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string;
  cover_image_id: string | null;
  author: string | null;
  featured: number;
  is_published: number;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Card-sized projection for list views -- never selects `content`, which can be long. */
export type BlogPostSummary = Omit<BlogPost, "content">;

const SUMMARY_COLUMNS =
  "id, slug, locale, title, excerpt, category, cover_image_id, author, featured, is_published, published_at, created_at, updated_at";

/** Published posts, newest first -- the public list page. */
export async function listPublishedPosts(locale: string): Promise<BlogPostSummary[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM blog_posts
        WHERE locale = ?1 AND is_published = 1
        ORDER BY published_at DESC`
    )
    .bind(locale)
    .all<BlogPostSummary>();
  return results;
}

export async function listPublishedPostsByCategory(locale: string, category: string): Promise<BlogPostSummary[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM blog_posts
        WHERE locale = ?1 AND is_published = 1 AND category = ?2
        ORDER BY published_at DESC`
    )
    .bind(locale, category)
    .all<BlogPostSummary>();
  return results;
}

/** A published post by slug -- the public detail page. Unpublished/foreign-locale posts 404, not just render draft content publicly. */
export async function getPublishedPost(locale: string, slug: string): Promise<BlogPost | null> {
  return getDb()
    .prepare(`SELECT * FROM blog_posts WHERE locale = ?1 AND slug = ?2 AND is_published = 1`)
    .bind(locale, slug)
    .first<BlogPost>();
}

/**
 * Sibling posts for the cross-link block (plan §10: "cross-link 2-6 sibling
 * posts per article"). Same category, published, excludes the post itself.
 */
export async function listSiblingPosts(locale: string, category: string, excludeSlug: string, limit = 6): Promise<BlogPostSummary[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM blog_posts
        WHERE locale = ?1 AND category = ?2 AND is_published = 1 AND slug != ?3
        ORDER BY published_at DESC
        LIMIT ?4`
    )
    .bind(locale, category, excludeSlug, limit)
    .all<BlogPostSummary>();
  return results;
}

// -- Dashboard (staff-only) reads/writes below. Include drafts. --

export async function listAllPosts(): Promise<BlogPostSummary[]> {
  const { results } = await getDb()
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM blog_posts ORDER BY updated_at DESC`)
    .all<BlogPostSummary>();
  return results;
}

export async function getPost(id: string): Promise<BlogPost | null> {
  return getDb().prepare("SELECT * FROM blog_posts WHERE id = ?1").bind(id).first<BlogPost>();
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return getDb().prepare("SELECT * FROM blog_posts WHERE slug = ?1").bind(slug).first<BlogPost>();
}

export interface BlogPostInput {
  slug: string;
  locale: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  cover_image_id: string;
  author: string;
  featured: boolean;
  is_published: boolean;
}

/**
 * Creates a new post. `published_at` is stamped only the moment it's first
 * published, not at creation time -- a draft saved today and published next
 * week should sort by when it went live, not when someone started typing.
 */
export async function createPost(input: BlogPostInput): Promise<string> {
  const id = crypto.randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO blog_posts
         (id, slug, locale, title, excerpt, content, category, cover_image_id, author, featured, is_published, published_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
    )
    .bind(
      id,
      input.slug,
      input.locale,
      input.title,
      input.excerpt || null,
      input.content,
      input.category,
      input.cover_image_id || null,
      input.author || null,
      input.featured ? 1 : 0,
      input.is_published ? 1 : 0,
      input.is_published ? Math.floor(Date.now() / 1000) : null
    )
    .run();
  return id;
}

/**
 * Updates an existing post. Same "stamp published_at only on the transition
 * into published" rule as createPost -- re-saving an already-published post
 * must not bump it back to the top of a date-sorted list.
 *
 * Returns whether a row actually matched, same convention as
 * bookings.ts's single-row updates (e.g. updateBookingStatus) -- a nonexistent
 * id must not fall through as a silent no-op success.
 */
export async function updatePost(id: string, input: BlogPostInput): Promise<boolean> {
  const existing = await getDb().prepare("SELECT is_published, published_at FROM blog_posts WHERE id = ?1").bind(id).first<{
    is_published: number;
    published_at: number | null;
  }>();
  if (!existing) return false;

  const newlyPublished = input.is_published && existing.is_published === 0;
  const publishedAt = newlyPublished ? Math.floor(Date.now() / 1000) : existing.published_at;

  const result = await getDb()
    .prepare(
      `UPDATE blog_posts
          SET slug = ?1, locale = ?2, title = ?3, excerpt = ?4, content = ?5, category = ?6,
              cover_image_id = ?7, author = ?8, featured = ?9, is_published = ?10,
              published_at = ?11, updated_at = unixepoch()
        WHERE id = ?12`
    )
    .bind(
      input.slug,
      input.locale,
      input.title,
      input.excerpt || null,
      input.content,
      input.category,
      input.cover_image_id || null,
      input.author || null,
      input.featured ? 1 : 0,
      input.is_published ? 1 : 0,
      publishedAt,
      id
    )
    .run();
  return result.meta.changes > 0;
}

/** Returns whether a row actually matched, same convention as updatePost. */
export async function deletePost(id: string): Promise<boolean> {
  const result = await getDb().prepare("DELETE FROM blog_posts WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}
