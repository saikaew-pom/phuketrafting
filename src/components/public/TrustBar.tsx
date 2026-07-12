import { Award } from "lucide-react";
import { PR_STATS } from "@/lib/content";

export function TrustBar() {
  return (
    <section className="pr-trustbar">
      <div className="pr-trustbar-inner">
        {PR_STATS.map((s) => (
          <div className="pr-trust-stat" key={s.label}>
            <span className="pr-trust-val">{s.value}</span>
            <span className="pr-trust-lbl">{s.label}</span>
          </div>
        ))}
        <div className="pr-trust-badge">
          <Award size={26} className="pr-ico pr-trust-badge-ico" />
          <div>
            <strong>Trusted local operator</strong>
            <span>Phang Nga · est. 2002</span>
          </div>
        </div>
      </div>
    </section>
  );
}
