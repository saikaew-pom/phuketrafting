import Link from "next/link";
import { MessageCircle, MapPin, Clock } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { listTours } from "@/lib/queries/tours";
import { getSiteStats, type Logo } from "@/lib/queries/settings";
import { cloudinaryUrl } from "@/lib/cloudinary";
import type { ChromeKey } from "@/lib/chrome-strings";

export async function Footer({
  locale,
  logo,
  strapline,
  strings,
}: {
  locale: string;
  logo: Logo;
  strapline: string;
  strings: Record<ChromeKey, string>;
}) {
  const stats = await getSiteStats();
  const tours = await listTours();
  // strings["footer.rated_by"] carries the {rating}/{count} tokens through
  // translation literally (translation-ai.ts's system prompt requires it) --
  // interpolated here with the real values, same reason blog-ai.ts never lets
  // the model invent a number: only real data fills a placeholder, never AI text.
  const ratedBy = strings["footer.rated_by"]
    .replaceAll("{rating}", stats.googleRating)
    .replaceAll("{count}", stats.reviewCount);

  return (
    <footer className="pr-footer">
      <div className="pr-wrap pr-footer-inner">
        <div className="pr-footer-brand">
          {logo.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- see Nav.tsx.
            <img className="pr-brand-logo" src={cloudinaryUrl(logo.imageId, 240)} alt={`${logo.wordOne} ${logo.wordTwo}`} />
          ) : (
            <span className="pr-brand-name pr-brand-name-light">
              {logo.wordOne} <span>{logo.wordTwo}</span>
            </span>
          )}
          <p>{strapline}</p>
          <a
            className="pr-btn pr-btn-accent"
            href={waLink("Hi! I'd like to book an adventure.")}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={17} className="pr-ico" /> {strings["footer.whatsapp_us"]}
          </a>
        </div>
        <div className="pr-footer-col">
          <h4>{strings["footer.tour_packages_heading"]}</h4>
          {/* Locale-prefixed so these work from the blog/manage/legal pages too,
              where a bare "#tours" points at a section that doesn't exist.
              Link (not <a>) keeps it a client nav rather than a full reload.
              (Audit A27.) */}
          {tours
            .filter((t) => t.is_active)
            .map((t) => (
              <Link key={t.id} href={`/${locale}#tours`}>
                {t.name}
              </Link>
            ))}
        </div>
        <div className="pr-footer-col">
          <h4>{strings["footer.explore_heading"]}</h4>
          <Link href={`/${locale}#tours`}>{strings["footer.all_tour_packages"]}</Link>
          <Link href={`/${locale}#why`}>{strings["footer.why_choose_us"]}</Link>
          <Link href={`/${locale}#reviews`}>{strings["footer.reviews"]}</Link>
          <Link href={`/${locale}#faq`}>{strings["footer.faq"]}</Link>
          <Link href={`/${locale}/blog`}>{strings["footer.blog"]}</Link>
        </div>
        <div className="pr-footer-col">
          <h4>{strings["footer.contact_heading"]}</h4>
          <a href={waLink("Hi!")} target="_blank" rel="noreferrer">
            <MessageCircle size={14} className="pr-ico" /> +66 65 010 2184
          </a>
          <span>
            <MapPin size={14} className="pr-ico" /> Le Rafting, Phang Nga
          </span>
          <span>
            <Clock size={14} className="pr-ico" /> {strings["footer.hours"]}
          </span>
        </div>
      </div>
      <div className="pr-footer-base">
        <span>&copy; 2026 Phuket Rafting &middot; Le Rafting, Phang Nga</span>
        <span className="pr-footer-legal">
          <Link href={`/${locale}/privacy`}>{strings["footer.privacy"]}</Link>
          <Link href={`/${locale}/terms`}>{strings["footer.terms"]}</Link>
          <Link href={`/${locale}/waiver`}>{strings["footer.waiver"]}</Link>
        </span>
        <span>{ratedBy}</span>
      </div>
    </footer>
  );
}
