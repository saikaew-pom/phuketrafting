import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPost, listSiblingPosts, categoryLabel } from "@/lib/queries/blog";
import { formatDateTime } from "@/lib/format";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n";
import { BlogBody } from "@/components/public/BlogBody";
import { extractFaqs } from "@/lib/blog-faq";
import { serializeJsonLd, buildArticleJsonLd, buildFaqJsonLd } from "@/lib/jsonld";
import { waLink } from "@/lib/whatsapp";

// Same fix as the rest of [lang]/* -- renders through the Footer, which needs
// getCloudflareContext() and can't be prerendered at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  // Content is EN-only for now (see the list page's comment) -- every locale
  // resolves the same EN post rather than 404ing on th/zh/ru.
  const post = await getPublishedPost(DEFAULT_LOCALE, slug);
  if (!post) return { title: `Blog -- ${BUSINESS_NAME}` };

  // Reciprocal hreflang + x-default, same shape as the Landing page's
  // generateMetadata. Every locale really does resolve this post (they all
  // serve the EN copy for now -- see the list page's comment), so listing
  // them is honest rather than aspirational.
  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}/blog/${post.slug}`])
  );
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}/blog/${post.slug}`;

  return {
    title: `${post.title} -- ${BUSINESS_NAME}`,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `${SITE_URL}/${lang}/blog/${post.slug}`, languages },
    robots: { index: true, follow: true },
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: "article",
      publishedTime: post.published_at ? new Date(post.published_at * 1000).toISOString() : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const post = await getPublishedPost(DEFAULT_LOCALE, slug);
  if (!post) notFound();

  const siblings = await listSiblingPosts(DEFAULT_LOCALE, post.category, post.slug);

  // Parsed out of the body the reader actually sees, never a separate copy --
  // see lib/blog-faq.ts on why FAQPage markup must match visible content.
  // A post with no "## FAQ" section simply gets no FAQ markup.
  const faqs = extractFaqs(post.content);
  const jsonLd: unknown[] = [
    buildArticleJsonLd({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      coverImageId: post.cover_image_id,
      author: post.author,
      publishedAt: post.published_at,
      updatedAt: post.updated_at,
      lang,
    }),
  ];
  if (faqs.length > 0) jsonLd.push(buildFaqJsonLd(faqs));

  return (
    <article className="pr-legal">
      {jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }} />
      ))}
      <div className="pr-wrap pr-wrap-narrow">
        <span className="pr-blog-card-category">{categoryLabel(post.category)}</span>
        <h1>{post.title}</h1>
        <p className="pr-legal-updated">
          {post.published_at && formatDateTime(post.published_at)}
          {post.author && <> &middot; {post.author}</>}
        </p>

        {post.cover_image_id && (
          <div className="pr-blog-hero">
            <Image src={post.cover_image_id} alt={post.title} fill sizes="(max-width: 820px) 100vw, 820px" priority />
          </div>
        )}

        <BlogBody markdown={post.content} />

        {siblings.length > 0 && (
          <>
            <h2>Read next</h2>
            <ul className="pr-blog-siblings">
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link href={`/${lang}/blog/${s.slug}`}>{s.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p>
          Ready to book?{" "}
          <a href={waLink(`Hi! I read "${post.title}" and have a question.`)} target="_blank" rel="noreferrer">
            Message us on WhatsApp
          </a>{" "}
          or <Link href={`/${lang}#tours`}>browse our tour packages</Link>.
        </p>
      </div>
    </article>
  );
}
