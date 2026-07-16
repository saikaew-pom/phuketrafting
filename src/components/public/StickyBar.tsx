"use client";

import { useEffect, useState } from "react";
import { Star, Zap } from "lucide-react";
import { baht } from "@/lib/format";

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
          <Star size={12} className="pr-ico pr-star-on" /> 4.9 · Free cancellation
        </span>
      </div>
      {/* The booking form, not WhatsApp. A button labelled "Book now" on a
          site with a working booking engine has to reach it -- this opened a
          chat instead. */}
      <a className="pr-btn pr-btn-accent" href="#top">
        <Zap size={16} className="pr-ico" /> Book now
      </a>
    </div>
  );
}
