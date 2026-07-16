#!/usr/bin/env node
/**
 * Imports reviewed blog-content/*.md files into blog_posts, INSERT-or-UPDATE
 * by slug (plan §10's "imported by the INSERT/UPDATE-by-slug script").
 * Slug is the identity, matching the table's own UNIQUE constraint.
 *
 * EXISTING POSTS ARE SKIPPED UNLESS --overwrite.
 *
 * That default exists because there are two ways a post can change and only
 * one of them is these files. Staff publish and edit through the Phase 7b
 * dashboard; a markdown file is a launch/seed artifact that nobody updates
 * afterwards. So the obvious-looking "add post #11" run --
 *   npm run blog:import -- --apply --remote
 * -- would, if it updated everything by default, push `published: false` from
 * ten stale files over ten LIVE posts and take the entire blog offline, while
 * reverting every dashboard typo fix, and the dry run would say nothing more
 * alarming than "draft" beside each one. Adding a post must not be able to
 * unpublish the others by accident.
 *
 * --overwrite is the "the files are right, force them in" escape hatch (it is
 * also how you publish: flip `published: true` in the file, then overwrite).
 * It prints every content revert and every live->draft transition it is about
 * to cause, and the dry run shows exactly the same list.
 *
 * Usage:
 *   node scripts/import-blog-posts.mjs                    # local D1, dry run
 *   node scripts/import-blog-posts.mjs --apply            # local D1, new posts only
 *   node scripts/import-blog-posts.mjs --apply --overwrite    # also update existing
 *   node scripts/import-blog-posts.mjs --apply --remote       # PRODUCTION D1
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BLOG_CONTENT_DIR, d1Query, d1File, parsePost } from "./lib/blog-pipeline.mjs";

// Must match BLOG_CATEGORIES in src/lib/queries/blog.ts. A category outside
// this set renders as a raw slug on the site (categoryLabel falls through to
// the id) and never appears in the "Browse by topic" filter -- so a typo here
// is invisible content, not a crash. Checked, not trusted.
const CATEGORIES = ["rafting", "jungle-adventures", "trip-planning", "camping", "nature-culture"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** SQLite string literal. Doubling the quote is the whole escape -- there is no other metacharacter inside '...'. */
function q(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Docs that live alongside the posts. Listed explicitly, and "_"-prefixed
 * files are ignored too, rather than skipping anything that fails to parse --
 * a post file with a typo'd name or broken front-matter must still fail the
 * import loudly instead of vanishing from it.
 */
const NOT_POSTS = new Set(["README.md"]);

function loadPosts() {
  const files = readdirSync(BLOG_CONTENT_DIR).filter(
    (f) => f.endsWith(".md") && !NOT_POSTS.has(f) && !f.startsWith("_")
  );
  const posts = [];
  const errors = [];

  for (const file of files.sort()) {
    try {
      const { front, body } = parsePost(readFileSync(join(BLOG_CONTENT_DIR, file), "utf8"));

      if (!front.slug) throw new Error("front-matter has no slug");
      if (!SLUG_RE.test(front.slug)) throw new Error(`slug "${front.slug}" is not lowercase-kebab-case`);
      // The filename is the human-facing index of this directory; letting it
      // drift from the slug it imports as makes "which file is this post?"
      // unanswerable at a glance.
      if (`${front.slug}.md` !== file) throw new Error(`slug "${front.slug}" does not match filename "${file}"`);
      if (!front.title) throw new Error("front-matter has no title");
      if (!CATEGORIES.includes(front.category)) {
        throw new Error(`category "${front.category}" is not one of: ${CATEGORIES.join(", ")}`);
      }

      posts.push({
        slug: front.slug,
        title: front.title,
        category: front.category,
        excerpt: front.excerpt || null,
        author: front.author || null,
        featured: front.featured === "true" || front.featured === true,
        published: front.published === "true" || front.published === true,
        cover_image_id: front.cover_image_id || null,
        content: body,
      });
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }
  return { posts, errors };
}

/**
 * `published_at` is stamped only on the transition into published, exactly
 * like src/lib/queries/blog.ts's updatePost -- a re-import of an already-live
 * post must not bump it to the top of the date-sorted blog index. The
 * excluded.* / blog_posts.* split in the DO UPDATE is what expresses that:
 * take the file's new values, keep the row's existing published_at unless it
 * was a draft until now.
 *
 * Written with nested IIF() rather than the CASE...END this started as, and
 * that is NOT cosmetic. `wrangler d1 execute --file` splits the file into
 * statements with its own tokenizer, which treats `CASE` as opening a
 * compound statement and only closes it on /\sEND[;\s]/ -- an `END,` (i.e.
 * CASE followed by another assignment) never closes it, so every subsequent
 * `;` stopped terminating statements and all N posts silently merged into ONE
 * statement. That still executed, so it looked fine -- until the merged
 * statement crossed D1's hard 100 KB SQL statement limit, at which point the
 * whole import dies with `statement too long: SQLITE_TOOBIG` and no clue
 * which post or why. At 10 posts the merged statement was already 82 KB.
 * IIF() has no END, so the tokenizer never enters compound mode and each post
 * stays its own statement, sized independently of how many posts exist.
 */
function toSql(post) {
  return `INSERT INTO blog_posts
  (id, slug, locale, title, excerpt, content, category, cover_image_id, author, featured, is_published, published_at)
VALUES (
  ${q(crypto.randomUUID())}, ${q(post.slug)}, 'en', ${q(post.title)}, ${q(post.excerpt)}, ${q(post.content)},
  ${q(post.category)}, ${q(post.cover_image_id)}, ${q(post.author)}, ${post.featured ? 1 : 0},
  ${post.published ? 1 : 0}, ${post.published ? "unixepoch()" : "NULL"}
)
ON CONFLICT(slug) DO UPDATE SET
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  category = excluded.category,
  cover_image_id = excluded.cover_image_id,
  author = excluded.author,
  featured = excluded.featured,
  is_published = excluded.is_published,
  published_at = IIF(excluded.is_published = 0, NULL,
                     IIF(blog_posts.is_published = 0, unixepoch(), blog_posts.published_at)),
  updated_at = unixepoch();`;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const remote = args.includes("--remote");
  const overwrite = args.includes("--overwrite");

  const { posts, errors } = loadPosts();
  if (errors.length) {
    console.error("Refusing to import -- fix these files first:\n");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  if (!posts.length) {
    console.log("No posts in blog-content/.");
    return;
  }

  const existing = new Map(
    d1Query("SELECT slug, is_published, content FROM blog_posts", { remote }).map((r) => [r.slug, r])
  );

  console.log(`Target: ${remote ? "REMOTE (production)" : "local"} D1\n`);

  const toWrite = [];
  const skipped = [];
  const warnings = [];

  for (const p of posts) {
    const row = existing.get(p.slug);
    if (!row) {
      console.log(`  insert  ${p.slug}  [${p.category}]  ${p.published ? "PUBLISHED" : "draft"}`);
      toWrite.push(p);
      continue;
    }
    if (!overwrite) {
      skipped.push(p.slug);
      continue;
    }

    // Spell out what overwriting this row actually destroys. "update" alone
    // reads as harmless; "takes a live post offline" does not.
    const notes = [];
    if (row.is_published === 1 && !p.published) notes.push("UNPUBLISHES a live post");
    if (row.content !== p.content) notes.push("overwrites content (discards any dashboard edit)");
    if (notes.length) warnings.push(`${p.slug}: ${notes.join("; ")}`);

    console.log(`  update  ${p.slug}  [${p.category}]  ${p.published ? "PUBLISHED" : "draft"}${notes.length ? "  <-- " + notes.join("; ") : ""}`);
    toWrite.push(p);
  }

  if (skipped.length) {
    console.log(`\n  skipped ${skipped.length} existing post(s) -- pass --overwrite to update them:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
  if (warnings.length) {
    console.log(`\n  ${warnings.length} destructive change(s):`);
    for (const w of warnings) console.log(`    ${w}`);
  }

  if (!toWrite.length) {
    console.log("\nNothing to do.");
    return;
  }

  const willPublish = toWrite.filter((p) => p.published).length;
  console.log(`\n${toWrite.length} post(s) to write: ${willPublish} published, ${toWrite.length - willPublish} draft.`);

  if (!apply) {
    console.log("\nDry run -- nothing written. Re-run with --apply to import.");
    return;
  }

  const path = join(tmpdir(), `blog-import-${Date.now()}.sql`);
  writeFileSync(path, toWrite.map(toSql).join("\n\n"));
  try {
    d1File(path, { remote });
    console.log(`\nImported ${toWrite.length} post(s) into ${remote ? "production" : "local"} D1.`);
  } finally {
    unlinkSync(path);
  }
}

main();
