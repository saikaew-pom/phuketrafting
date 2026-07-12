import { SITE_URL, BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/site";
import { PR_STATS, FAQS } from "@/lib/content";
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

function parseStat(value: string): number | null {
  // Strip thousands separators first -- "1,200+".match(/[\d.]+/) stops at
  // the comma and silently returns "1", not 1200.
  const match = value.replace(/,/g, "").match(/[\d.]+/);
  return match ? Number(match[0]) : null;
}

export function buildOrganizationJsonLd() {
  const ratingValue = parseStat(PR_STATS.find((s) => s.label === "Google rating")?.value ?? "");
  const reviewCount = parseStat(PR_STATS.find((s) => s.label === "Reviews")?.value ?? "");

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
    ...(ratingValue != null && reviewCount != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue,
            reviewCount,
          },
        }
      : {}),
  };
}

export function buildProductsJsonLd(tours: TourCard[]) {
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
      url: `${SITE_URL}/en#tours`,
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

export function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}
