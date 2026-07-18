import { ShieldCheck, ShowerHead, HardHat, Users, Leaf, Headset, MessageCircle, type LucideIcon } from "lucide-react";
import type { SiteStats, SectionsContent } from "@/lib/queries/settings";
import { waLink } from "@/lib/whatsapp";
import { SectionHead } from "@/components/public/SectionHead";

// Fixed icons matched to the editable why-card text by position (getSections
// keeps whyCards a fixed-length list overlaid on the defaults).
const WHY_ICONS: LucideIcon[] = [ShieldCheck, ShowerHead, HardHat, Users, Leaf, Headset];

/** Fills the {placeholders} in the copy from the one shared stats source. */
function fill(text: string, stats: SiteStats): string {
  return text
    .replace(/\{travelerCount\}/g, stats.travelerCount)
    .replace(/\{googleRating\}/g, stats.googleRating)
    .replace(/\{reviewCount\}/g, stats.reviewCount);
}

export function WhyUs({ stats, sections }: { stats: SiteStats; sections: SectionsContent }) {
  return (
    <section className="pr-section" id="why">
      <div className="pr-wrap">
        <div className="pr-why-grid">
          <div className="pr-why-intro">
            <SectionHead eyebrow={sections.whyEyebrow} title={sections.whyTitle} />
            <p className="pr-why-lead">{fill(sections.whyLead, stats)}</p>
            <div className="pr-why-cta">
              <a
                className="pr-btn pr-btn-dark"
                href={waLink("Hi! I'd like to know more about your tours.")}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={17} className="pr-ico" /> Chat with us
              </a>
              <a className="pr-btn pr-btn-ghost" href="#tours">
                Browse tours
              </a>
            </div>
          </div>
          <div className="pr-why-cards">
            {sections.whyCards.map((w, i) => {
              const WhyIcon = WHY_ICONS[i] ?? ShieldCheck;
              return (
                <div className="pr-why-card" key={i}>
                  <div className="pr-why-ico">
                    <WhyIcon size={22} className="pr-ico" />
                  </div>
                  <h3>{fill(w.title, stats)}</h3>
                  <p>{fill(w.text, stats)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
