import Link from "next/link";
import { MessageCircle, MapPin, Clock } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { listTours } from "@/lib/queries/tours";
import { getSiteStats, type Logo } from "@/lib/queries/settings";
import { cloudinaryUrl } from "@/lib/cloudinary";

export async function Footer({ locale, logo, strapline }: { locale: string; logo: Logo; strapline: string }) {
  const stats = await getSiteStats();
  const tours = await listTours();

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
            <MessageCircle size={17} className="pr-ico" /> WhatsApp us
          </a>
        </div>
        <div className="pr-footer-col">
          <h4>Tour packages</h4>
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
          <h4>Explore</h4>
          <Link href={`/${locale}#tours`}>All tour packages</Link>
          <Link href={`/${locale}#why`}>Why choose us</Link>
          <Link href={`/${locale}#reviews`}>Reviews</Link>
          <Link href={`/${locale}#faq`}>FAQ</Link>
          <Link href={`/${locale}/blog`}>Blog</Link>
        </div>
        <div className="pr-footer-col">
          <h4>Contact</h4>
          <a href={waLink("Hi!")} target="_blank" rel="noreferrer">
            <MessageCircle size={14} className="pr-ico" /> +66 65 010 2184
          </a>
          <span>
            <MapPin size={14} className="pr-ico" /> Le Rafting, Phang Nga
          </span>
          <span>
            <Clock size={14} className="pr-ico" /> Daily · 8am&ndash;6pm
          </span>
        </div>
      </div>
      <div className="pr-footer-base">
        <span>&copy; 2026 Phuket Rafting &middot; Le Rafting, Phang Nga</span>
        <span className="pr-footer-legal">
          <Link href={`/${locale}/privacy`}>Privacy</Link>
          <Link href={`/${locale}/terms`}>Terms</Link>
          <Link href={`/${locale}/waiver`}>Waiver</Link>
        </span>
        <span>Rated {stats.googleRating}&#9733; by {stats.reviewCount} travelers</span>
      </div>
    </footer>
  );
}
