import type { Metadata } from "next";
import { listTours, listAllTourRates, parseIncludes, type Tour } from "@/lib/queries/tours";
import { listTourCategories } from "@/lib/queries/tour-categories";
import { listCampZones, getMinCampRate } from "@/lib/queries/camping";
import { listPublishedReviews, listTourReviewStats } from "@/lib/queries/reviews";
import { listPickupZones } from "@/lib/queries/pickup";
import { listImages } from "@/lib/queries/images";
import { listActiveFaqs } from "@/lib/queries/faqs";
import { listActiveAddons } from "@/lib/queries/addons";
import { getSiteStats, getHero, getSections, getSeo } from "@/lib/queries/settings";
import { getTranslationMap } from "@/lib/queries/translations";
import {
  mergeHero,
  mergeSections,
  mergeSeo,
  HERO_CONTENT_TYPE,
  SECTIONS_CONTENT_TYPE,
  SEO_CONTENT_TYPE,
  GLOBAL_CONTENT_ID,
} from "@/lib/translatable-content";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { GALLERY } from "@/lib/content";
import { SITE_URL, BUSINESS_NAME } from "@/lib/site";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n";
import { serializeJsonLd, buildOrganizationJsonLd, buildProductsJsonLd, buildFaqJsonLd } from "@/lib/jsonld";
import { Hero } from "@/components/public/Hero";
import { TrustBar } from "@/components/public/TrustBar";
import { Tours, type TourCard, type TourCategoryHead } from "@/components/public/Tours";
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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const canonical = `${SITE_URL}/${lang}`;
  // Staff-editable meta (homepage CMS stage 3), overlaid with this locale's
  // cached translation where one exists. Defaults reproduce the previous
  // hardcoded values, so an unset row keeps today's SEO exactly.
  const seoEn = await getSeo();
  const seo = isSupportedLocale(lang)
    ? mergeSeo(seoEn, await getTranslationMap(SEO_CONTENT_TYPE, GLOBAL_CONTENT_ID, lang))
    : seoEn;
  const heroImage = cloudinaryUrl(seo.shareImageId, 1200);

  // Reciprocal hreflang: every locale variant points at every other, plus
  // an x-default fallback.
  const languages = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}`]));
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}`;

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical, languages },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: canonical,
      siteName: BUSINESS_NAME,
      images: [{ url: heroImage, width: 1200, height: 630 }],
      locale: lang,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [heroImage],
    },
  };
}

function fromPrice(rates: { price: number }[]): number {
  const positive = rates.map((r) => r.price).filter((p) => p > 0);
  return positive.length ? Math.min(...positive) : 0;
}

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const [allTours, allTourRates, tourCategories, campZones, reviews, tourReviewStats, pickupZones, galleryRows] = await Promise.all([
    listTours(),
    listAllTourRates(),
    listTourCategories(),
    listCampZones(),
    listPublishedReviews(),
    listTourReviewStats(),
    listPickupZones(),
    listImages("gallery", null),
  ]);
  const siteStats = await getSiteStats();
  // EN is canonical; this locale's cached translation is overlaid per-field, so
  // a missing or partly-generated translation renders English rather than a
  // blank band (same contract as getChromeStrings and settings.ts's getters).
  const heroEn = await getHero();
  const sectionsEn = await getSections();
  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const [heroT, sectionsT] = await Promise.all([
    getTranslationMap(HERO_CONTENT_TYPE, GLOBAL_CONTENT_ID, locale),
    getTranslationMap(SECTIONS_CONTENT_TYPE, GLOBAL_CONTENT_ID, locale),
  ]);
  const hero = mergeHero(heroEn, heroT);
  const sections = mergeSections(sectionsEn, sectionsT);
  const faqRows = await listActiveFaqs();
  // Priced add-ons (migration 0018), shown as tick-boxes in both booking
  // widgets. The widget sends only the ticked ids; price/name are re-resolved
  // server-side at booking time, so this list is display-only.
  const addonRows = await listActiveAddons();
  const bookingAddons = addonRows.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    price: a.price,
  }));
  // Dashboard-managed FAQ, shared by the visible accordion AND the FAQPage
  // JSON-LD so they can't drift. (F4-style CMS; seeded from the old constant.)
  const faqItems = faqRows.map((f) => ({ q: f.question, a: f.answer }));

  // Dashboard-managed gallery, falling back to the hardcoded launch set while
  // the gallery table is empty -- so the section is never blank and staff can
  // take it over image by image. (Audit #6 / F4.)
  const galleryItems =
    galleryRows.length > 0
      ? galleryRows.map((g) => ({ publicId: g.image_id, label: g.label ?? "" }))
      : GALLERY.map((g) => ({ publicId: g.publicId, label: g.label }));

  // Which tours appear on the homepage, and under which heading, is DATA now
  // (migration 0020) -- it used to be a hardcoded PRIMARY_TOUR_IDS constant, so
  // adding a new kind of tour meant a code change. A tour shows here when it is
  // active AND flagged show_on_home; it renders under its category's section.
  // listTours() returns every row (the dashboard needs inactive ones too), so
  // the public page filters is_active itself.
  const featuredTours = allTours.filter((t) => t.is_active === 1 && t.show_on_home === 1);

  // One query for every rate row, grouped here -- not one getTourRates() round
  // trip per featured tour, which would grow with however many tours staff
  // feature. (Same read-then-group shape as listTourReviewStats below.)
  const ratesByTourId = new Map<string, { price: number }[]>();
  for (const rate of allTourRates) {
    const list = ratesByTourId.get(rate.tour_id);
    if (list) list.push(rate);
    else ratesByTourId.set(rate.tour_id, [rate]);
  }
  const reviewStatsByTour = new Map(tourReviewStats.map((s) => [s.tour_id, s]));

  const toCard = (tour: Tour): TourCard => {
    const stats = reviewStatsByTour.get(tour.id);
    return {
      id: tour.id,
      name: tour.name,
      tagline: tour.tagline,
      coverImageId: tour.cover_image_id,
      fromPrice: fromPrice(ratesByTourId.get(tour.id) ?? []),
      durationLabel: tour.duration_label,
      groupLabel: tour.min_group != null && tour.max_group != null ? `${tour.min_group}–${tour.max_group} guests` : null,
      badge: tour.badge,
      // parseIncludes, not raw JSON.parse: a hand-corrupted row must drop the
      // bullets, not 500 the whole Landing page (same guard the editor uses).
      highlights: parseIncludes(tour.includes),
      avgRating: stats?.avg_rating ?? null,
      reviewCount: stats?.review_count ?? null,
      // 'enquire' tours have no online schedule -- their card asks for an
      // enquiry instead of pointing at the booking widget.
      bookingMode: tour.booking_mode === "enquire" ? "enquire" : "instant",
    };
  };

  // Sections, in category order; a category with no featured tours is skipped
  // so an empty group can never render a bare heading. allTours is already
  // sorted by sort_order, so each group keeps the staff-chosen order.
  //
  // Note what this DROPS: a tour flagged show_on_home whose category_id is null,
  // or whose category is inactive, belongs to no section and so renders nowhere.
  // That is deliberate (a marketing homepage should not grow an "Uncategorised"
  // heading), but it means the flag can be silently ineffective -- staff need a
  // dashboard warning for it, tracked separately.
  const homeSections = tourCategories
    .filter((c) => c.is_active === 1)
    .map((c): { category: TourCategoryHead; tours: TourCard[] } => ({
      category: c,
      tours: featuredTours.filter((t) => t.category_id === c.id).map(toCard),
    }))
    .filter((s) => s.tours.length > 0);

  // Nav, Hero, WhyUs, the footer and every blog post link to "#tours". Before
  // the homepage was data-driven the section rendered unconditionally, so that
  // anchor always existed; now a site with no active category (one toggle on
  // the categories screen) would drop it -- and take the camping teaser, which
  // lives in the first section's grid, down with it. The fallback keeps the
  // landmark and the teaser, using the heading the page had before stage 3.
  const FALLBACK_HEAD: TourCategoryHead = {
    id: "cat-fallback",
    slug: "tours",
    name: "Pick your package",
    tagline: null,
  };
  const sectionsToRender = (homeSections.length > 0 ? homeSections : [{ category: FALLBACK_HEAD, tours: [] }]).map(
    (s, i) => ({ ...s, anchorId: i === 0 ? "tours" : `tours-${s.category.slug}` })
  );

  // Page-wide summaries are derived from what actually RENDERS, not from
  // featuredTours: a featured-but-unroutable tour (see above) must not be
  // advertised by markup or a price the visitor can't find on the page.
  // Verified live: before this, an uncategorised featured tour still emitted a
  // Product JSON-LD entry, sat in the widget dropdown, and drove the sticky bar
  // to "From ฿111" while the cheapest visible card was ฿999.
  const tourCards: TourCard[] = sectionsToRender.flatMap((s) => s.tours);

  // The booking widget can only sell tours with a real schedule -- 'enquire'
  // tours are deliberately absent from its dropdown.
  const bookingTours = tourCards
    .filter((t) => t.bookingMode !== "enquire")
    .map((t) => ({ id: t.id, name: t.name, fromPrice: t.fromPrice }));

  // No "?? campZones[0]" fallback: if every zone is inactive, staff have
  // deliberately switched camping off (same "Active (visible on site)"
  // toggle used for tours) -- showing a hidden zone's photo/price anyway
  // would contradict that.
  const teaserZone = campZones.find((z) => z.is_active) ?? null;
  const minCampRate = teaserZone ? await getMinCampRate(teaserZone.id) : null;
  const camping =
    teaserZone && minCampRate != null
      ? {
          fromPrice: minCampRate,
          coverImageId: teaserZone.cover_image_id,
          name: teaserZone.name,
          tagline: teaserZone.tagline,
        }
      : null;

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

  const jsonLd = [
    buildOrganizationJsonLd(),
    // Each offer URL points at the section the card really renders in, so the
    // anchor in the markup and the anchor on the page can't drift apart.
    ...buildProductsJsonLd(
      sectionsToRender.flatMap((s) => s.tours.map((t) => ({ ...t, anchor: s.anchorId }))),
      lang
    ),
    // Skip FAQ markup entirely if staff have hidden them all -- an empty
    // FAQPage is invalid structured data.
    ...(faqItems.length > 0 ? [buildFaqJsonLd(faqItems)] : []),
  ];

  return (
    <>
      {jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }} />
      ))}
      <Hero tours={bookingTours} pickupZones={pickupZones} addons={bookingAddons} locale={lang} stats={siteStats} hero={hero} />
      <TrustBar stats={siteStats} />
      {/* One section per active category that has featured tours. The first
          carries id="tours" (the nav's "Adventures" anchor) and the camping
          teaser card, so a single-category site renders exactly as before. */}
      {sectionsToRender.map((s, i) => (
        <Tours
          key={s.category.id}
          category={s.category}
          tours={s.tours}
          camping={i === 0 ? camping : null}
          anchorId={s.anchorId}
          showEyebrow={i === 0}
        />
      ))}
      {activeCampZones.length > 0 && <CampBookingSection zones={activeCampZones} addons={bookingAddons} locale={lang} />}
      <HowItWorks sections={sections} />
      <WhyUs stats={siteStats} sections={sections} />
      <Reviews reviews={reviewCards} stats={siteStats} />
      <Gallery items={galleryItems} />
      <FAQ items={faqItems} />
      <EnquirySection locale={lang} />
      <FinalCTA sections={sections} />
      <StickyBar fromPrice={Number.isFinite(stickyFromPrice) ? stickyFromPrice : 0} stats={siteStats} />
    </>
  );
}
