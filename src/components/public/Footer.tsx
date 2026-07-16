import Link from "next/link";
import { MessageCircle, MapPin, Clock } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { listTours } from "@/lib/queries/tours";

export async function Footer({ locale }: { locale: string }) {
  const tours = await listTours();

  return (
    <footer className="pr-footer">
      <div className="pr-wrap pr-footer-inner">
        <div className="pr-footer-brand">
          <span className="pr-brand-name pr-brand-name-light">
            PHUKET <span>RAFTING</span>
          </span>
          <p>Phang Nga&apos;s most experienced white-water rafting, zipline &amp; ATV operator since 2002.</p>
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
          {tours
            .filter((t) => t.is_active)
            .map((t) => (
              <a key={t.id} href="#tours">
                {t.name}
              </a>
            ))}
        </div>
        <div className="pr-footer-col">
          <h4>Explore</h4>
          <a href="#tours">All tour packages</a>
          <a href="#why">Why choose us</a>
          <a href="#reviews">Reviews</a>
          <a href="#faq">FAQ</a>
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
        <span>Rated 4.9&#9733; by 1,200+ travelers</span>
      </div>
    </footer>
  );
}
