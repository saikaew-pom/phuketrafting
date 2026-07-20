"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Menu, X } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { cloudinaryUrl } from "@/lib/cloudinary";
import type { Logo } from "@/lib/queries/settings";
import type { ChromeKey } from "@/lib/chrome-strings";

// The sections these anchor to only exist on the landing page. On any other
// page under [lang] (blog, manage, privacy...) a bare "#tours" points at
// nothing, so the links did nothing. hrefFor() prefixes the locale-home path
// when we're NOT on the landing page, so they navigate home and then scroll;
// on the landing page they stay bare hashes to keep the in-page smooth scroll.
// (Audit A27.)
const LINKS: { hash: string; key: ChromeKey }[] = [
  { hash: "#top", key: "nav.home" },
  { hash: "#tours", key: "nav.adventures" },
  { hash: "#why", key: "nav.why" },
  { hash: "#reviews", key: "nav.reviews" },
  { hash: "#faq", key: "nav.faq" },
];

export function Nav({
  locale,
  logo,
  strings,
}: {
  locale: string;
  logo: Logo;
  strings: Record<ChromeKey, string>;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Landing page is exactly /<locale> (or "/" before the locale rewrite).
  const onLanding = pathname === `/${locale}` || pathname === "/";
  const hrefFor = (hash: string) => (onLanding ? hash : `/${locale}${hash}`);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={"pr-nav" + (scrolled ? " pr-nav-scrolled" : "")}>
      <div className="pr-nav-inner">
        <a href={hrefFor("#top")} className="pr-brand">
          {logo.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo aspect
            // ratio is unknown (admin upload); a plain <img> sized by CSS height
            // avoids next/image's required width/height. Cloudinary negotiates
            // format/quality via cloudinaryUrl.
            <img className="pr-brand-logo" src={cloudinaryUrl(logo.imageId, 240)} alt={`${logo.wordOne} ${logo.wordTwo}`} />
          ) : (
            <span className="pr-brand-name">
              {logo.wordOne} <span>{logo.wordTwo}</span>
            </span>
          )}
        </a>
        <nav className="pr-nav-links">
          {LINKS.map((l) => (
            <a key={l.hash} href={hrefFor(l.hash)}>
              {strings[l.key]}
            </a>
          ))}
        </nav>
        <div className="pr-nav-cta">
          <a
            className="pr-nav-phone"
            href={waLink("Hi! I'd like to ask about your adventure tours.")}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={17} className="pr-ico" /> <span>{strings["nav.whatsapp"]}</span>
          </a>
          {/* #top = the hero's booking form. It pointed at #book, which is the
              closing CTA section, not the form -- so "Book now" scrolled past
              the booking widget to a different button. */}
          <a className="pr-btn pr-btn-accent" href={hrefFor("#top")}>
            {strings["nav.book_now"]}
          </a>
          <button className="pr-nav-burger" onClick={() => setOpen(!open)} aria-label={strings["nav.menu_aria"]}>
            {open ? <X size={22} className="pr-ico" /> : <Menu size={22} className="pr-ico" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="pr-nav-mobile">
          {LINKS.map((l) => (
            <a key={l.hash} href={hrefFor(l.hash)} onClick={() => setOpen(false)}>
              {strings[l.key]}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
