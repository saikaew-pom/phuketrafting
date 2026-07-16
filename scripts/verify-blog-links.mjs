#!/usr/bin/env node
/**
 * Phase 7's exit test (plan §12): "No orphan posts; all slugs resolve."
 * Plan §10: "Cross-link 2-6 sibling posts per article; no orphans; verify
 * slugs by script."
 *
 * Checks the POSTS AS THEY WILL BE PUBLISHED -- reads blog_posts out of D1
 * rather than the markdown in blog-content/, because D1 is what the site
 * actually renders. A post edited in the dashboard after import never touches
 * blog-content/, so verifying the files would happily pass a site that is
 * actually broken.
 *
 * Usage:
 *   node scripts/verify-blog-links.mjs            # local D1
 *   node scripts/verify-blog-links.mjs --remote   # production D1
 */
import { d1Query } from "./lib/blog-pipeline.mjs";

/**
 * Anchors that really exist on the Landing page. Verified against the
 * components that render them (Tours.tsx, CampBookingSection.tsx,
 * FinalCTA.tsx, FAQ.tsx) -- an internal link to an anchor nobody renders is
 * a silent dead end: it 200s and lands the reader at the top of the page.
 */
const LANDING_ANCHORS = new Set(["tours", "camp-book", "book", "faq", "top", "why", "reviews"]);

/** Real routes under /[lang]/ -- anything else is a 404. */
const STATIC_PATHS = new Set(["", "blog", "privacy", "terms", "waiver"]);

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * The post a link points at: { slug, extra } for /en/blog/<slug>, else null.
 *
 * Shared by checkUrl and the inbound-link counter deliberately. They used to
 * parse the URL separately -- a path split for the route check, a regex for
 * the counter -- and disagreed: "/en/blog/foo/" passed the route check while
 * the counter read its slug as "foo/" and credited the link to nobody, which
 * can report a well-linked post as an ORPHAN. One parser means the exit test
 * cannot contradict itself.
 */
function postLinkTarget(url) {
  const path = url.split(/[#?]/)[0];
  const parts = path.split("/").filter(Boolean); // ["en", "blog", "slug"]
  if (parts[0] !== "en" || parts[1] !== "blog" || !parts[2]) return null;
  // /en/blog/<slug>/anything is a 404: app/[lang]/blog/[slug]/page.tsx is a
  // single dynamic segment, not a catch-all.
  return { slug: parts[2], extra: parts.length > 3 };
}

function checkUrl(url, publishedSlugs) {
  if (/^https?:\/\//i.test(url)) return null; // external -- not this script's job
  if (url.startsWith("#")) return `bare fragment "${url}" (relative to the post, almost certainly meant /en#...)`;
  if (!url.startsWith("/")) return `relative link "${url}" -- must be absolute`;

  const [path, hash] = url.split("#");
  const parts = path.split("/").filter(Boolean); // ["en", "blog", "slug"]

  if (parts[0] !== "en") return `"${url}" does not start with /en`;

  const target = postLinkTarget(url);
  if (target) {
    if (target.extra) return `"${url}" has extra path segments after the slug -- /en/blog/<slug> is the whole post route (404)`;
    if (!publishedSlugs.has(target.slug)) {
      return `links to /en/blog/${target.slug}, which is not a published post (404)`;
    }
    return null;
  }

  const rest = parts.slice(1).join("/");
  if (!STATIC_PATHS.has(rest)) return `"${url}" is not a known route`;
  if (hash && rest === "" && !LANDING_ANCHORS.has(hash)) return `"${url}" points at an anchor that no section renders`;
  return null;
}

function main() {
  const remote = process.argv.includes("--remote");
  const posts = d1Query("SELECT slug, title, category, content, is_published FROM blog_posts WHERE is_published = 1", {
    remote,
  });

  if (!posts.length) {
    console.log(`No published posts in ${remote ? "production" : "local"} D1 -- nothing to verify.`);
    return;
  }

  const publishedSlugs = new Set(posts.map((p) => p.slug));
  // Same-category siblings are what the detail page's "Read next" block links
  // automatically (listSiblingPosts in src/lib/queries/blog.ts), so a post
  // with a sibling is reachable even with no in-body links at all.
  const byCategory = new Map();
  for (const p of posts) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);

  const problems = [];
  const inboundLinks = new Map(posts.map((p) => [p.slug, 0]));

  for (const post of posts) {
    for (const [, , url] of post.content.matchAll(LINK_RE)) {
      const problem = checkUrl(url, publishedSlugs);
      if (problem) problems.push(`${post.slug}: ${problem}`);

      const target = postLinkTarget(url);
      if (target && !target.extra) {
        if (target.slug === post.slug) problems.push(`${post.slug}: links to itself`);
        else if (inboundLinks.has(target.slug)) inboundLinks.set(target.slug, inboundLinks.get(target.slug) + 1);
      }
    }
  }

  // An orphan is a post nothing points at: no in-body link from another post,
  // AND no same-category sibling to surface it in "Read next". Such a page is
  // reachable only from the blog index and reads as dead weight to a crawler.
  const orphans = posts.filter((p) => inboundLinks.get(p.slug) === 0 && (byCategory.get(p.category) ?? 0) < 2);

  console.log(`Checked ${posts.length} published post(s) in ${remote ? "production" : "local"} D1.\n`);
  for (const post of posts) {
    const inbound = inboundLinks.get(post.slug);
    const siblings = (byCategory.get(post.category) ?? 1) - 1;
    console.log(`  ${post.slug}\n      ${inbound} inbound link(s), ${siblings} same-category sibling(s)`);
  }

  if (orphans.length) {
    console.log("");
    for (const o of orphans) problems.push(`${o.slug}: ORPHAN -- no inbound links and no same-category sibling`);
  }

  if (problems.length) {
    console.error(`\nFAILED -- ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log("\nPASS -- every internal link resolves, no orphans.");
}

main();
