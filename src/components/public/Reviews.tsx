import { MessageCircle } from "lucide-react";
import { Stars } from "@/components/public/Stars";
import { SectionHead } from "@/components/public/SectionHead";

export interface ReviewCard {
  id: number;
  guestName: string;
  guestPlace: string | null;
  rating: number;
  content: string;
  tourName: string | null;
}

export function Reviews({ reviews }: { reviews: ReviewCard[] }) {
  return (
    <section className="pr-section pr-section-tint" id="reviews">
      <div className="pr-wrap">
        <div className="pr-rev-top">
          <SectionHead eyebrow="Traveler stories" title="Loved by 5,000+ adventurers" />
          <div className="pr-rev-score">
            <span className="pr-rev-num">4.9</span>
            <div>
              <Stars n={5} size={17} />
              <span className="pr-rev-count">
                <MessageCircle size={14} className="pr-ico" /> 1,200+ reviews
              </span>
            </div>
          </div>
        </div>
        <div className="pr-rev-grid">
          {reviews.map((r) => (
            <figure className="pr-rev-card" key={r.id}>
              <Stars n={r.rating} size={15} />
              <blockquote>&quot;{r.content}&quot;</blockquote>
              <figcaption>
                <span className="pr-rev-avatar">{r.guestName[0]}</span>
                <div>
                  <strong>{r.guestName}</strong>
                  <span>
                    {r.guestPlace}
                    {r.tourName ? ` · ${r.tourName}` : ""}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
