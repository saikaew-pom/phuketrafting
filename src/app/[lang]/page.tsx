import type { Metadata } from "next";
import { listTours, getTourRates } from "@/lib/queries/tours";
import { listCampZones, getMinCampRate } from "@/lib/queries/camping";
import { listPublishedReviews, listTourReviewStats } from "@/lib/queries/reviews";
import { listPickupZones } from "@/lib/queries/pickup";
import { SITE_URL, BUSINESS_NAME } from "@/lib/site";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import { serializeJsonLd, buildOrganizationJsonLd, buildProductsJsonLd, buildFaqJsonLd } from "@/lib/jsonld";
import { Hero } from "@/components/public/Hero";
import { TrustBar } from "@/components/public/TrustBar";
import { Tours, type TourCard } from "@/components/public/Tours";
import { CampBookingSection } from "@/components/public/CampBookingSection";
import { HowItWorks } from "@/components/public/HowItWorks";
import { WhyUs } from "@/components/public/WhyUs";
import { Reviews, type ReviewCard } from "@/components/public/Reviews";
import { Gallery } from "@/components/public/Gallery";
import { FAQ } from "@/components/public/FAQ";
import { EnquirySection } from "@/components/public/EnquirySection";
import { FinalCTA } from "@/components/public/FinalCTA";
import { StickyBar } from "@/components/public/StickyBar";

// D1 reads happen at request time via getCloudflareContext(), which isn't
// available during the static build-time prerender that generateStaticParams
// (layout.tsx) would otherwise trigger for the "en" params entry.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "White-water rafting, ziplines and ATV adventures through the wild heart of Phang Nga -- run by the pros who've done it safely for 20+ years.";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const canonical = `${SITE_URL}/${lang}`;
  const heroImage = "https://res.cloudinary.com/daxyt9sso/image/upload/f_auto,q_auto,w_1200/au7evtgufphh8vmfyaor";

  // Reciprocal hreflang: every locale variant points at every other, plus
  // an x-default fallback. All four locales render today (identical EN
  // copy on TH/ZH/RU until real translations land -- see [lang]/layout.tsx),
  // so this is honest: the URLs really do resolve, even if not yet in the
  // visitor's language.
  const languages = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}`]));
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}`;

  return {
    title: `${BUSINESS_NAME} -- Rafting, Ziplines & ATV in Phang Nga`,
    description: DESCRIPTION,
    alternates: { canonical, languages },
    openGraph: {
      title: BUSINESS_NAME,
      description: DESCRIPTION,
      url: canonical,
      siteName: BUSINESS_NAME,
      images: [{ url: heroImage, width: 1200, height: 630 }],
      locale: lang,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: BUSINESS_NAME,
      description: DESCRIPTION,
      images: [heroImage],
    },
  };
}

// Primary rafting tiers shown on the Landing page grid, matching the
// prototype's 3-card layout; the "Extended Run" (7.5 km) variants are
// deliberately not surfaced here yet -- they belong on a future dedicated
// Tour Packages comparison page (see BUILD_AND_DEPLOY_PLAN.md Phase 3 scope).
const PRIMARY_TOUR_IDS = ["tour-b1", "tour-b2", "tour-b3"];

function fromPrice(rates: { price: number }[]): number {
  const positive = rates.map((r) => r.price).filter((p) => p > 0);
  return positive.length ? Math.min(...positive) : 0;
}

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const [allTours, campZones, reviews, tourReviewStats, pickupZones] = await Promise.all([
    listTours(),
    listCampZones(),
    listPublishedReviews(),
    listTourReviewStats(),
    listPickupZones(),
  ]);

  // listTours()/listCampZones() return every row, active or not (the
  // dashboard listing needs inactive rows too, to let staff re-enable them)
  // -- the public Landing page must filter to is_active itself.
  const primaryTours = PRIMARY_TOUR_IDS.map((id) => allTours.find((t) => t.id === id)).filter(
    (t): t is NonNullable<typeof t> => t != null && t.is_active === 1
  );

  const ratesByTour = await Promise.all(primaryTours.map((t) => getTourRates(t.id)));
  const reviewStatsByTour = new Map(tourReviewStats.map((s) => [s.tour_id, s]));

  const tourCards: TourCard[] = primaryTours.map((tour, i) => {
    const stats = reviewStatsByTour.get(tour.id);
    return {
      id: tour.id,
      name: tour.name,
      tagline: tour.tagline,
      coverImageId: tour.cover_image_id,
      fromPrice: fromPrice(ratesByTour[i]),
      durationLabel: tour.duration_label,
      groupLabel: tour.min_group != null && tour.max_group != null ? `${tour.min_group}–${tour.max_group} guests` : null,
      badge: tour.badge,
      highlights: JSON.parse(tour.includes) as string[],
      avgRating: stats?.avg_rating ?? null,
      reviewCount: stats?.review_count ?? null,
    };
  });

  const bookingTours = tourCards.map((t) => ({ id: t.id, name: t.name, fromPrice: t.fromPrice }));

  // No "?? campZones[0]" fallback: if every zone is inactive, staff have
  // deliberately switched camping off (same "Active (visible on site)"
  // toggle used for tours) -- showing a hidden zone's photo/price anyway
  // would contradict that.
  const teaserZone = campZones.find((z) => z.is_active) ?? null;
  const minCampRate = teaserZone ? await getMinCampRate(teaserZone.id) : null;
  const camping =
    teaserZone && minCampRate != null ? { fromPrice: minCampRate, coverImageId: teaserZone.cover_image_id } : null;

  const activeCampZones = campZones.filter((z) => z.is_active).map((z) => ({ id: z.id, name: z.name }));

  const tourNameById = new Map(allTours.map((t) => [t.id, t.name]));
  const reviewCards: ReviewCard[] = reviews.map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    guestPlace: r.guest_place,
    rating: r.rating,
    content: r.content,
    tourName: r.tour_id ? (tourNameById.get(r.tour_id) ?? null) : "Riverside Camping",
  }));

  const stickyFromPrice = Math.min(...tourCards.map((t) => t.fromPrice).filter((p) => p > 0), minCampRate ?? Infinity);

  const jsonLd = [buildOrganizationJsonLd(), ...buildProductsJsonLd(tourCards), buildFaqJsonLd()];

  return (
    <>
      {jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }} />
      ))}
      <Hero tours={bookingTours} pickupZones={pickupZones} locale={lang} />
      <TrustBar />
      <Tours tours={tourCards} camping={camping} />
      {activeCampZones.length > 0 && <CampBookingSection zones={activeCampZones} locale={lang} />}
      <HowItWorks />
      <WhyUs />
      <Reviews reviews={reviewCards} />
      <Gallery />
      <FAQ />
      <EnquirySection locale={lang} />
      <FinalCTA />
      <StickyBar fromPrice={Number.isFinite(stickyFromPrice) ? stickyFromPrice : 0} />
    </>
  );
}
