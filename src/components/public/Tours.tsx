import Image from "next/image";
import { Star, Clock, Users, Check, ArrowRight, Info } from "lucide-react";
import { baht } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { SectionHead } from "@/components/public/SectionHead";
import { CompareTable } from "@/components/public/CompareTable";

export interface TourCard {
  id: string;
  name: string;
  tagline: string | null;
  coverImageId: string | null;
  fromPrice: number;
  durationLabel: string | null;
  groupLabel: string | null;
  badge: string | null;
  highlights: string[];
  avgRating: number | null;
  reviewCount: number | null;
  /** 'enquire' tours have no bookable schedule -- their CTA asks for an enquiry. */
  bookingMode: "instant" | "enquire";
}

/** The homepage grouping this section renders (migration 0020). */
export interface TourCategoryHead {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
}

export interface CampingTeaser {
  fromPrice: number;
  coverImageId: string | null;
  /** The teaser zone's own DB name/tagline -- a staff rename must show here
      too, not just in the booking widget (caught by the CMS coverage audit:
      the card hardcoded copy the CMS appeared to control). */
  name: string;
  tagline: string | null;
}

export function Tours({
  category,
  tours,
  camping,
  anchorId = "tours",
  showEyebrow = true,
}: {
  category: TourCategoryHead;
  tours: TourCard[];
  camping: CampingTeaser | null;
  /** First section keeps id="tours" so the nav's "Adventures" anchor still lands. */
  anchorId?: string;
  showEyebrow?: boolean;
}) {
  return (
    <section className="pr-section" id={anchorId}>
      <div className="pr-wrap">
        <SectionHead
          eyebrow={showEyebrow ? "Our adventures" : undefined}
          title={category.name}
          sub={
            category.tagline ??
            "Every trip includes safety gear, certified guides, hot showers and a story you'll be telling for years."
          }
        />
        <div className="pr-tours-grid">
          {tours.map((tour) => (
            <article className="pr-tcard pr-tcard-imgtop" key={tour.id}>
              <div className="pr-tcard-media">
                {tour.coverImageId && (
                  <Image src={tour.coverImageId} alt={tour.name} fill sizes="(max-width: 768px) 100vw, 33vw" />
                )}
                {/* CSS defines .pr-badge-b1/-b2/-b3 (globals.css), not
                    .pr-badge-tour-b1 -- tour.id is the full "tour-b1" row id,
                    so strip the "tour-" prefix or the badge silently renders
                    with no background (white text on transparent, invisible
                    against a photo). Confirmed live: without this, all 3
                    tour badges (Bestseller/Most Popular/Best Value) show as
                    blank pills with unreadable text. */}
                {tour.badge && (
                  <span className={"pr-badge pr-badge-" + tour.id.replace(/^tour-/, "")}>{tour.badge}</span>
                )}
                {tour.avgRating != null && (
                  <span className="pr-tcard-rating">
                    <Star size={13} className="pr-ico pr-star-on" /> {tour.avgRating.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="pr-tcard-body">
                <h3 className="pr-tcard-name">{tour.name}</h3>
                {tour.tagline && <p className="pr-tcard-tag">{tour.tagline}</p>}
                <div className="pr-tcard-meta">
                  {tour.durationLabel && (
                    <span>
                      <Clock size={14} className="pr-ico" /> {tour.durationLabel}
                    </span>
                  )}
                  {tour.groupLabel && (
                    <span>
                      <Users size={14} className="pr-ico" /> {tour.groupLabel}
                    </span>
                  )}
                </div>
                <ul className="pr-tcard-list">
                  {tour.highlights.slice(0, 3).map((h) => (
                    <li key={h}>
                      <Check size={15} className="pr-ico" /> {h}
                    </li>
                  ))}
                </ul>
                <div className="pr-tcard-foot">
                  <div className="pr-tcard-price">
                    {/* fromPrice is 0 only for a tour with no priced
                        tour_rates row yet (staff created it, haven't set a
                        price) -- never a genuinely free tour. "from ฿0" reads
                        as a real, absurdly good offer rather than
                        not-yet-configured, so this branch is a fallback
                        message instead. Same fromPrice > 0 filter jsonld.ts's
                        buildProductsJsonLd call already applies. */}
                    {tour.fromPrice > 0 ? (
                      <>
                        <span className="pr-tcard-from">from</span>
                        <span className="pr-tcard-amt">{baht(tour.fromPrice)}</span>
                        <span className="pr-tcard-per">/ person</span>
                      </>
                    ) : (
                      <span className="pr-tcard-from">Price on request</span>
                    )}
                  </div>
                  {/* Instant tours go to the booking form with THIS tour
                      preselected (BookingWidget listens for #book-<id>).
                      'enquire' tours have no online schedule, so pointing at
                      the widget would strand the guest -- they go to the
                      enquiry form instead. */}
                  {tour.bookingMode === "enquire" ? (
                    <a className="pr-btn pr-btn-accent" href="#contact">
                      Enquire
                      <ArrowRight size={16} className="pr-ico" />
                    </a>
                  ) : (
                    <a className="pr-btn pr-btn-accent" href={`#book-${tour.id}`}>
                      Book
                      <ArrowRight size={16} className="pr-ico" />
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}

          {camping && (
            <article className="pr-tcard pr-tcard-imgtop">
              <div className="pr-tcard-media">
                {camping.coverImageId && (
                  <Image
                    src={camping.coverImageId}
                    alt={camping.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                )}
                <span className="pr-badge pr-badge-camp">New</span>
              </div>
              <div className="pr-tcard-body">
                <h3 className="pr-tcard-name">{camping.name}</h3>
                <p className="pr-tcard-tag">{camping.tagline ?? "Retreat & glamping by the river"}</p>
                <div className="pr-tcard-meta">
                  <span>
                    <Clock size={14} className="pr-ico" /> Overnight
                  </span>
                  <span>
                    <Users size={14} className="pr-ico" /> Couples &amp; groups
                  </span>
                </div>
                <ul className="pr-tcard-list">
                  <li>
                    <Check size={15} className="pr-ico" /> Sleep beside the river
                  </li>
                  <li>
                    <Check size={15} className="pr-ico" /> Glamping tents + campfire
                  </li>
                  <li>
                    <Check size={15} className="pr-ico" /> Wake to the sound of the rapids
                  </li>
                </ul>
                <div className="pr-tcard-foot">
                  <div className="pr-tcard-price">
                    <span className="pr-tcard-from">from</span>
                    <span className="pr-tcard-amt">{baht(camping.fromPrice)}</span>
                    <span className="pr-tcard-per">/ night</span>
                  </div>
                  <a className="pr-btn pr-btn-accent" href="#camp-book">
                    Book
                    <ArrowRight size={16} className="pr-ico" />
                  </a>
                </div>
              </div>
            </article>
          )}
        </div>
        {/* A real comparison built from the same DB fields as the cards --
            this was a WhatsApp link asking staff to compile it by hand. Only
            worth showing when there's actually something to compare. */}
        {tours.length >= 2 && (
          <div className="pr-tours-cta">
            <CompareTable tours={tours} />
          </div>
        )}
        <p className="pr-tours-note">
          <Info size={15} className="pr-ico" /> Not sure which to pick?{" "}
          <a href={waLink("Hi! Can you help me choose the right adventure package?")} target="_blank" rel="noreferrer">
            Message us your group
          </a>{" "}
          and we&apos;ll recommend the perfect fit.
        </p>
      </div>
    </section>
  );
}
