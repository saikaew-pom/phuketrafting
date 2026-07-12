import Image from "next/image";
import { ShieldCheck, ShowerHead, BadgeCheck, Zap, Play } from "lucide-react";
import { Stars } from "@/components/public/Stars";
import { BookingWidget, type BookingTourOption } from "@/components/public/BookingWidget";

const HERO_IMAGE_ID = "au7evtgufphh8vmfyaor";

export function Hero({ tours, locale }: { tours: BookingTourOption[]; locale: string }) {
  return (
    <section className="pr-hero pr-hero-split" id="top">
      <div className="pr-hero-bg">
        <Image src={HERO_IMAGE_ID} alt="White-water rafting in Phang Nga" fill priority sizes="100vw" />
        <div className="pr-hero-scrim" />
      </div>
      <div className="pr-hero-inner">
        <div className="pr-hero-copy">
          <span className="pr-pill pr-pill-glass">
            <Stars n={4.9} size={13} /> 4.9 · 1,200+ reviews · Since 2002
          </span>
          <h1 className="pr-hero-h1">
            Swap a lazy beach day for an <em>unforgettable</em> rush.
          </h1>
          <p className="pr-hero-sub">
            White-water rafting, ziplines and ATV adventures through the wild heart of Phang Nga -- run by the pros
            who&apos;ve done it safely for 20+ years.
          </p>
          <div className="pr-hero-trust">
            <span>
              <ShieldCheck size={17} className="pr-ico" /> Certified guides
            </span>
            <span>
              <ShowerHead size={17} className="pr-ico" /> Hot showers
            </span>
            <span>
              <BadgeCheck size={17} className="pr-ico" /> Free to reserve
            </span>
          </div>
          <div className="pr-hero-actions">
            <a className="pr-btn pr-btn-accent pr-btn-lg" href="#book">
              <Zap size={18} className="pr-ico" /> Book your adventure
            </a>
            <a className="pr-btn pr-btn-ghost-light pr-btn-lg" href="#tours">
              <Play size={16} className="pr-ico" /> See all packages
            </a>
          </div>
        </div>
        <div className="pr-hero-widget">
          <BookingWidget tours={tours} locale={locale} />
        </div>
      </div>
    </section>
  );
}
