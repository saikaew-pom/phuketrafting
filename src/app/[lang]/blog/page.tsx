import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listPublishedPosts, listPublishedPostsByCategory, BLOG_CATEGORIES, categoryLabel, isBlogCategory } from "@/lib/queries/blog";
import { formatDateTime } from "@/lib/format";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n";

// Same fix as privacy/terms/manage -- this page renders through
// [lang]/layout.tsx's Footer (listTours() -> getCloudflareContext()), which
// isn't available during the static build-time prerender.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const languages = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}/blog`]));
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}/blog`;

  return {
    title: `Blog -- ${BUSINESS_NAME}`,
    description: "Guides on rafting, jungle adventures, trip planning and riverside camping in Phang Nga, Thailand.",
    alternates: { canonical: `${SITE_URL}/${lang}/blog`, languages },
    robots: { index: true, follow: true },
  };
}

export default async function BlogListPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { lang } = await params;
  const { category } = await searchParams;
  const activeCategory = category && isBlogCategory(category) ? category : null;

  // Content is EN-only until real per-locale translation lands (plan §8,
  // content_translations -- unused everywhere so far, see [lang]/layout.tsx's
  // comment). Every locale shows the same EN posts rather than an empty list.
  const posts = activeCategory
    ? await listPublishedPostsByCategory(DEFAULT_LOCALE, activeCategory)
    : await listPublishedPosts(DEFAULT_LOCALE);

  return (
    <article className="pr-legal">
      <div className="pr-wrap">
        <h1>Blog</h1>
        <p className="pr-legal-updated">
          {activeCategory
            ? categoryLabel(activeCategory)
            : "Guides on rafting, jungle adventures, trip planning and riverside camping around Phang Nga."}
        </p>

        {posts.length === 0 ? (
          <p>New guides are on their way -- check back soon.</p>
        ) : (
          <div className="pr-blog-grid">
            {posts.map((post) => (
              <Link key={post.id} href={`/${lang}/blog/${post.slug}`} className="pr-blog-card">
                {post.cover_image_id && (
                  <div className="pr-blog-card-media">
                    <Image src={post.cover_image_id} alt={post.title} fill sizes="(max-width: 768px) 100vw, 33vw" />
                  </div>
                )}
                <div className="pr-blog-card-body">
                  <span className="pr-blog-card-category">{categoryLabel(post.category)}</span>
                  <h3>{post.title}</h3>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  {post.published_at && <span className="pr-blog-card-date">{formatDateTime(post.published_at)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <h2>Browse by topic</h2>
        <ul className="pr-blog-categories">
          <li>
            <Link href={`/${lang}/blog`} className={activeCategory ? undefined : "pr-blog-category-active"}>
              All
            </Link>
          </li>
          {BLOG_CATEGORIES.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${lang}/blog?category=${c.id}`}
                className={activeCategory === c.id ? "pr-blog-category-active" : undefined}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
