"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Menu, X } from "lucide-react";
import { waLink } from "@/lib/whatsapp";

// Tour Packages / Camping Stay are dedicated pages in the original prototype
// (Tour Packages.html, Camping Stay.html) -- not yet ported, so these link to
// the on-page sections that exist today instead of a route that would 404.
const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#tours", label: "Adventures" },
  { href: "#why", label: "Why us" },
  { href: "#reviews", label: "Reviews" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={"pr-nav" + (scrolled ? " pr-nav-scrolled" : "")}>
      <div className="pr-nav-inner">
        <Link href="#top" className="pr-brand">
          <span className="pr-brand-name">
            PHUKET <span>RAFTING</span>
          </span>
        </Link>
        <nav className="pr-nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
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
            <MessageCircle size={17} className="pr-ico" /> <span>WhatsApp</span>
          </a>
          <a className="pr-btn pr-btn-accent" href="#book">
            Book now
          </a>
          <button className="pr-nav-burger" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X size={22} className="pr-ico" /> : <Menu size={22} className="pr-ico" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="pr-nav-mobile">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
