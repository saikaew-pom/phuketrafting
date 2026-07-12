"use client";

import { useEffect, useState } from "react";
import { Star, Zap } from "lucide-react";
import { baht } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

export function StickyBar({ fromPrice }: { fromPrice: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={"pr-sticky" + (show ? " pr-sticky-on" : "")}>
      <div>
        <span className="pr-sticky-from">From {baht(fromPrice)}</span>
        <span className="pr-sticky-sub">
          <Star size={12} className="pr-ico pr-star-on" /> 4.9 · Free to reserve
        </span>
      </div>
      <a
        className="pr-btn pr-btn-accent"
        href={waLink("Hi! I'd like to book an adventure.")}
        target="_blank"
        rel="noreferrer"
      >
        <Zap size={16} className="pr-ico" /> Book now
      </a>
    </div>
  );
}
