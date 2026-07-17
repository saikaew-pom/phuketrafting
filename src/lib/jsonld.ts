import { SITE_URL, BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/site";
import { FAQS } from "@/lib/content";
import { cloudinaryUrl } from "@/lib/cloudinary";
import type { TourCard } from "@/components/public/Tours";

/**
 * Serializes a JSON-LD object for embedding in a <script type="application/
 * ld+json"> tag. Escaping "<" prevents a string field that happens to
 * contain "</script>" from breaking out of the tag -- all current inputs
 * are trusted server-side content, but this is cheap defense in depth per
 * plan §3's "XSS-escaped serializer" requirement.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Deliberately emits NO aggregateRating.
 *
 * It used to publish one built from the hardcoded PR_STATS array -- telling
 * Google "4.9 stars from 1,200 reviews" on the authority of numbers typed
 * into a source file. Google's structured-data policy requires review markup
 * to reflect genuine reviews collected and shown by the site; unverifiable
 * aggregate ratings are exactly what earns a manual action, and the risk is
 * asymmetric (a rich-result star vs. the whole domain's eligibility).
 *
 * Not fixed by pointing it at our own `reviews` table either: that holds a
 * handful of curated site testimonials, while the claim says *Google* rating
 * -- a different population living in Google Business Profile. Deriving one
 * from the other would be a tidier-looking version of the same lie.
 *
 * Per-tour Product markup DOES carry aggregateRating (see
 * buildProductsJsonLd) because those numbers come from listTourReviewStats --
 * real reviews, really rendered on the page they describe. That is the
 * distinction the policy actually draws.
 */
export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: BUSINESS_NAME,
    url: SITE_URL,
    telephone: BUSINESS_PHONE,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Phang Nga",
      addressCountry: "TH",
    },
  };
}

export function buildProductsJsonLd(tours: TourCard[], lang: string) {
  return tours.map((tour) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: tour.name,
    description: tour.tagline ?? undefined,
    image: tour.coverImageId ? cloudinaryUrl(tour.coverImageId, 1200) : undefined,
    offers: {
      "@type": "Offer",
      price: tour.fromPrice,
      priceCurrency: "THB",
      availability: "https://schema.org/InStock",
      // The offer URL points at the page it's embedded on, per locale -- was
      // hardcoded /en on every locale's markup. (Audit A26.)
      url: `${SITE_URL}/${lang}#tours`,
    },
    ...(tour.avgRating != null && tour.reviewCount != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: tour.avgRating,
            reviewCount: tour.reviewCount,
          },
        }
      : {}),
  }));
}

/**
 * Defaults to the Landing page's hardcoded FAQS; blog posts pass their own
 * (parsed out of the post body by lib/blog-faq.ts) rather than getting a
 * second near-identical builder.
 */
export function buildFaqJsonLd(faqs: readonly { q: string; a: string }[] = FAQS) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export interface ArticleJsonLdInput {
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageId: string | null;
  author: string | null;
  publishedAt: number | null;
  updatedAt: number;
  lang: string;
}

/**
 * Article markup for one blog post (plan §10: "Each post: JSON-LD").
 *
 * `publisher` is the same TouristAttraction entity buildOrganizationJsonLd
 * describes on the Landing page -- referenced by @id rather than re-stated,
 * so the two can't drift into describing the business differently.
 */
export function buildArticleJsonLd(post: ArticleJsonLdInput) {
  const url = `${SITE_URL}/${post.lang}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.coverImageId ? cloudinaryUrl(post.coverImageId, 1200) : undefined,
    // D1 stores unixepoch() SECONDS -- Date expects milliseconds (same trap
    // lib/format.ts's formatDateTime documents).
    datePublished: post.publishedAt ? new Date(post.publishedAt * 1000).toISOString() : undefined,
    dateModified: new Date(post.updatedAt * 1000).toISOString(),
    ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
    publisher: {
      "@type": "Organization",
      name: BUSINESS_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}
