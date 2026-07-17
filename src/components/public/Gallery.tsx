"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SectionHead } from "@/components/public/SectionHead";

export interface GalleryItem {
  publicId: string;
  label: string;
}

// items come from D1 (dashboard-managed) via the landing page, or the
// hardcoded fallback when the gallery table is empty. The mosaic CSS defines
// positions pr-gitem-0..5, so positions cycle with % 6 for any count.
export function Gallery({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const count = items.length;

  useEffect(() => {
    if (index == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex((i) => (i == null ? i : (i + 1) % count));
      if (e.key === "ArrowLeft") setIndex((i) => (i == null ? i : (i - 1 + count) % count));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count]);

  if (count === 0) return null;

  return (
    <section className="pr-section" id="gallery">
      <div className="pr-wrap">
        <SectionHead center eyebrow="Straight from the river" title="This could be your day" />
        <div className="pr-gallery">
          {items.map((g, i) => (
            <button className={"pr-gitem pr-gitem-" + (i % 6)} key={`${g.publicId}-${i}`} onClick={() => setIndex(i)}>
              <Image src={g.publicId} alt={g.label} fill sizes="(max-width: 768px) 50vw, 25vw" />
              <span className="pr-gitem-lbl">
                <Maximize2 size={14} className="pr-ico" /> {g.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {index != null && (
        <div className="pr-lb" onClick={() => setIndex(null)}>
          <button className="pr-lb-x" aria-label="Close" onClick={() => setIndex(null)}>
            <X size={24} className="pr-ico" />
          </button>
          <button
            className="pr-lb-nav pr-lb-prev"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i == null ? i : (i - 1 + count) % count));
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={28} className="pr-ico" />
          </button>
          <figure className="pr-lb-fig" onClick={(e) => e.stopPropagation()}>
            <Image src={items[index].publicId} alt={items[index].label} width={1200} height={800} />
            <figcaption>{items[index].label}</figcaption>
          </figure>
          <button
            className="pr-lb-nav pr-lb-next"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i == null ? i : (i + 1) % count));
            }}
            aria-label="Next"
          >
            <ChevronRight size={28} className="pr-ico" />
          </button>
        </div>
      )}
    </section>
  );
}
