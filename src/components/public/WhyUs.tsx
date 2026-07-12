import { ShieldCheck, ShowerHead, HardHat, Users, Leaf, Headset, MessageCircle, type LucideIcon } from "lucide-react";
import { WHY } from "@/lib/content";
import { waLink } from "@/lib/whatsapp";
import { SectionHead } from "@/components/public/SectionHead";

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  ShowerHead,
  HardHat,
  Users,
  Leaf,
  Headset,
};

export function WhyUs() {
  return (
    <section className="pr-section" id="why">
      <div className="pr-wrap">
        <div className="pr-why-grid">
          <div className="pr-why-intro">
            <SectionHead eyebrow="Why Phuket Rafting" title="20+ years of thrills. Zero worries." />
            <p className="pr-why-lead">
              Craving adventure but worried about the risks? We&apos;ve solved that. We turn the chaos of the jungle
              into a seamless, safe and genuinely clean experience you&apos;ll want to repeat.
            </p>
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
            {WHY.map((w) => {
              const WhyIcon = ICONS[w.icon];
              return (
                <div className="pr-why-card" key={w.title}>
                  <div className="pr-why-ico">
                    <WhyIcon size={22} className="pr-ico" />
                  </div>
                  <h3>{w.title}</h3>
                  <p>{w.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
