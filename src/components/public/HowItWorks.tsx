import { MousePointerClick, CalendarCheck, Bus, Waves, type LucideIcon } from "lucide-react";
import type { SectionsContent } from "@/lib/queries/settings";
import { SectionHead } from "@/components/public/SectionHead";

// Icons + step numbers stay fixed in code (design), matched to the editable
// step text by position -- see getSections, which keeps `steps` a fixed-length
// list overlaid on the defaults.
const STEP_ICONS: LucideIcon[] = [MousePointerClick, CalendarCheck, Bus, Waves];

export function HowItWorks({ sections }: { sections: SectionsContent }) {
  return (
    <section className="pr-section pr-section-tint" id="how">
      <div className="pr-wrap">
        <SectionHead center eyebrow={sections.howEyebrow} title={sections.howTitle} sub={sections.howSub} />
        <div className="pr-steps">
          {sections.steps.map((s, i) => {
            const StepIcon = STEP_ICONS[i] ?? MousePointerClick;
            return (
              <div className="pr-step" key={i}>
                <div className="pr-step-ico">
                  <StepIcon size={26} className="pr-ico" />
                </div>
                <span className="pr-step-n">{`0${i + 1}`}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {i < sections.steps.length - 1 && <span className="pr-step-line" />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
