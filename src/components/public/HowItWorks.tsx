import { MousePointerClick, CalendarCheck, Bus, Waves, type LucideIcon } from "lucide-react";
import { STEPS } from "@/lib/content";
import { SectionHead } from "@/components/public/SectionHead";

const ICONS: Record<string, LucideIcon> = {
  MousePointerClick,
  CalendarCheck,
  Bus,
  Waves,
};

export function HowItWorks() {
  return (
    <section className="pr-section pr-section-tint" id="how">
      <div className="pr-wrap">
        <SectionHead
          center
          eyebrow="Easy as it gets"
          title="Booked in four simple steps"
          sub="No accounts, no deposits, no stress. Just message and go."
        />
        <div className="pr-steps">
          {STEPS.map((s, i) => {
            const StepIcon = ICONS[s.icon];
            return (
              <div className="pr-step" key={s.n}>
                <div className="pr-step-ico">
                  <StepIcon size={26} className="pr-ico" />
                </div>
                <span className="pr-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {i < STEPS.length - 1 && <span className="pr-step-line" />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
