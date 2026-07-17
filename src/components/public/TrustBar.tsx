import { Award } from "lucide-react";
import type { SiteStats } from "@/lib/queries/settings";

/**
 * The four headline numbers. Derived from the NAMED facts in settings rather
 * than a positional list, so this bar and the Hero pill can no longer claim
 * different ratings -- they now read the same source. See getSiteStats.
 */
export function TrustBar({ stats }: { stats: SiteStats }) {
  const cards = [
    { value: `${stats.googleRating}\u2605`, label: "Google rating" },
    { value: stats.reviewCount, label: "Reviews" },
    { value: stats.travelerCount, label: "Travelers" },
    { value: `Since ${stats.sinceYear}`, label: "Years running" },
  ];

  return (
    <section className="pr-trustbar">
      <div className="pr-trustbar-inner">
        {cards.map((s) => (
          <div className="pr-trust-stat" key={s.label}>
            <span className="pr-trust-val">{s.value}</span>
            <span className="pr-trust-lbl">{s.label}</span>
          </div>
        ))}
        <div className="pr-trust-badge">
          <Award size={26} className="pr-ico pr-trust-badge-ico" />
          <div>
            <strong>Trusted local operator</strong>
            <span>Phang Nga &middot; est. {stats.sinceYear}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
