import type { Metadata } from "next";
import Link from "next/link";
import { listImages } from "@/lib/queries/images";
import { listTags, listImagesByTagSlug } from "@/lib/queries/tags";
import { Gallery } from "@/components/public/Gallery";
import { GALLERY } from "@/lib/content";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n";

// Same reason as blog/page.tsx -- renders through [lang]/layout.tsx's Footer
// (listTours() -> getCloudflareContext()), unavailable at the build-time
// prerender.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const languages = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}/gallery`]));
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}/gallery`;

  return {
    title: `Photo gallery -- ${BUSINESS_NAME}`,
    description:
      "Real photos from our white-water rafting, zipline, ATV and riverside camping trips in Phang Nga, Thailand.",
    alternates: { canonical: `${SITE_URL}/${lang}/gallery`, languages },
    robots: { index: true, follow: true },
  };
}

/**
 * The full photo library (F4 follow-up) -- the homepage strip only shows
 * `show_on_home=1` rows; this page shows every gallery photo regardless,
 * filterable by tag via ?tag=<slug>. Same searchParam-driven filter shape as
 * blog/page.tsx's ?category=, including its "bad/stale param degrades to
 * empty, never a 500" stance -- listImagesByTagSlug returns [] for an
 * unknown slug rather than throwing.
 */
export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { lang } = await params;
  const { tag: rawTag } = await searchParams;
  // Next parses a REPEATED query key (?tag=a&tag=b) into a string[], not the
  // `string` the type above promises -- confirmed live, an unguarded array
  // reached listImagesByTagSlug's D1 .bind() and 500'd the page. Anything
  // that isn't a real, non-empty string degrades to "no filter" instead,
  // same "bad input never 500s a public page" stance as the slug lookup
  // itself already has for a slug that just doesn't match any tag.
  const tag = typeof rawTag === "string" && rawTag.trim() !== "" ? rawTag : null;

  const [allTags, images] = await Promise.all([listTags(), tag ? listImagesByTagSlug(tag) : listImages("gallery", null)]);
  const activeTag = tag ? (allTags.find((t) => t.slug === tag) ?? null) : null;

  // Falls back to the hardcoded launch set exactly like the homepage does
  // ([lang]/page.tsx), and for the same reason -- otherwise the two disagree in
  // the state the site is actually in today (product_images is empty): the
  // homepage renders six photos while this page, linked from the footer on
  // every page, renders "Photos are on their way". Since this route is
  // index: true and listed in sitemap.ts, that empty page also gets crawled.
  //
  // Only the UNFILTERED branch falls back. A tag-filtered view that genuinely
  // matches nothing must stay empty -- showing untagged launch photos under
  // "Photos tagged X" would be a wrong answer rather than a graceful one.
  const items =
    images.length > 0 || tag
      ? images.map((g) => ({ publicId: g.image_id, label: g.label ?? "" }))
      : GALLERY.map((g) => ({ publicId: g.publicId, label: g.label }));

  return (
    <div>
      {/* pr-legal, not a bare pr-wrap: .pr-nav is `position: fixed` with a
          transparent background until scrolled (designed to sit over the
          homepage hero image) -- every other content page (blog, privacy,
          terms, waiver) clears it via pr-legal's 140px top padding. A page
          without that wrapper renders its heading UNDERNEATH the nav.
          Confirmed live at 375px: the H1 sat at top:48px against a 79px-tall
          transparent nav, so "Photo gallery" rendered visually overlapping
          the logo/Book-now button. */}
      <article className="pr-legal">
        <div className="pr-wrap">
          <h1>Photo gallery</h1>
          <p className="pr-legal-updated">
            Real photos from our trips -- browse everything, or filter by what you&apos;re into.
          </p>

          {allTags.length > 0 && (
            <ul className="pr-blog-categories">
              <li>
                {/* Keyed off `tag`, not `activeTag`: a slug that matches no
                    known tag must not light up "All" -- confirmed live that
                    ?tag=<unknown-slug> used to show "All" as active while the
                    actual view was an empty, tag-filtered result. `activeTag`
                    is only non-null for a slug that resolved to a real tag, so
                    using it here would call an unmatched-but-attempted filter
                    the same as no filter at all. */}
                <Link href={`/${lang}/gallery`} className={tag ? undefined : "pr-blog-category-active"}>
                  All
                </Link>
              </li>
              {allTags.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/${lang}/gallery?tag=${t.slug}`}
                    className={activeTag?.id === t.id ? "pr-blog-category-active" : undefined}
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {items.length === 0 && (
            <p>{tag ? "No photos with this tag yet." : "Photos are on their way -- check back soon."}</p>
          )}
        </div>
      </article>

      {items.length > 0 && (
        <Gallery
          items={items}
          eyebrow={activeTag ? activeTag.name : "The full collection"}
          title={activeTag ? `Photos tagged "${activeTag.name}"` : "Every trip, every smile"}
        />
      )}
    </div>
  );
}
