import Image from "next/image";
import { ShieldCheck, ShowerHead, BadgeCheck, Zap, Play } from "lucide-react";
import { Stars } from "@/components/public/Stars";
import { BookingWidget, type BookingTourOption, type BookingAddonOption } from "@/components/public/BookingWidget";
import type { PickupZone } from "@/lib/queries/pickup";
import type { SiteStats, HeroContent } from "@/lib/queries/settings";

/**
 * Render `heading` with the first occurrence of `emphasis` wrapped in <em>
 * (the accent-italic word). Case-insensitive match; no emphasis (or not found)
 * renders the heading plain. Split on the real substring so staff type plain
 * text -- there's no markup to escape, and React escapes the segments anyway.
 */
function renderHeading(heading: string, emphasis: string): React.ReactNode {
  const e = emphasis.trim();
  if (!e) return heading;
  // Match case-insensitively via a regex so the highlighted slice is taken
  // straight from the ORIGINAL string (m[0]/m.index), never re-derived from a
  // lowercased copy. toLowerCase() can change a string's length -- e.g. a
  // Turkish "İ" lowercases to two code units -- which would shift every
  // subsequent index and wrap the wrong characters. The emphasis is escaped so
  // it matches literally (a staff-typed "." must not act as a wildcard).
  const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = heading.match(new RegExp(escaped, "i"));
  if (!m || m.index === undefined) return heading;
  return (
    <>
      {heading.slice(0, m.index)}
      <em>{m[0]}</em>
      {heading.slice(m.index + m[0].length)}
    </>
  );
}

export function Hero({
  tours,
  pickupZones,
  addons,
  locale,
  stats,
  hero,
}: {
  tours: BookingTourOption[];
  pickupZones: PickupZone[];
  addons: BookingAddonOption[];
  /** Headline claims -- shared with TrustBar/Reviews/Footer so they can't disagree. */
  stats: SiteStats;
  /** Staff-editable hero copy/image (homepage CMS). */
  hero: HeroContent;
  locale: string;
}) {
  return (
    <section className="pr-hero pr-hero-split" id="top">
      <div className="pr-hero-bg">
        <Image src={hero.backgroundImageId} alt="White-water rafting in Phang Nga" fill priority sizes="100vw" />
        <div className="pr-hero-scrim" />
      </div>
      <div className="pr-hero-inner">
        <div className="pr-hero-copy">
          <span className="pr-pill pr-pill-glass">
            <Stars n={Number(stats.googleRating) || 5} size={13} /> {stats.googleRating} · {stats.reviewCount} reviews ·
            Since {stats.sinceYear}
          </span>
          <h1 className="pr-hero-h1">{renderHeading(hero.heading, hero.headingEmphasis)}</h1>
          <p className="pr-hero-sub">{hero.subheading}</p>
          <div className="pr-hero-trust">
            <span>
              <ShieldCheck size={17} className="pr-ico" /> {hero.trustOne}
            </span>
            <span>
              <ShowerHead size={17} className="pr-ico" /> {hero.trustTwo}
            </span>
            <span>
              <BadgeCheck size={17} className="pr-ico" /> {hero.trustThree}
            </span>
          </div>
          <div className="pr-hero-actions">
            <a className="pr-btn pr-btn-accent pr-btn-lg" href="#book">
              <Zap size={18} className="pr-ico" /> {hero.primaryCtaLabel}
            </a>
            <a className="pr-btn pr-btn-ghost-light pr-btn-lg" href="#tours">
              <Play size={16} className="pr-ico" /> {hero.secondaryCtaLabel}
            </a>
          </div>
        </div>
        <div className="pr-hero-widget">
          <BookingWidget tours={tours} pickupZones={pickupZones} addons={addons} locale={locale} />
        </div>
      </div>
    </section>
  );
}
