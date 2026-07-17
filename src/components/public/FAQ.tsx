"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { FAQS } from "@/lib/content";
import { waLink } from "@/lib/whatsapp";
import { SectionHead } from "@/components/public/SectionHead";

export function FAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className="pr-section pr-section-tint" id="faq">
      <div className="pr-wrap pr-wrap-narrow">
        <SectionHead center eyebrow="Good to know" title="Questions, answered" />
        <div className="pr-faq">
          {FAQS.map((f, i) => (
            <div className={"pr-faq-item" + (open === i ? " pr-faq-open" : "")} key={f.q}>
              {/* aria-expanded/controls so a screen reader announces the
                  accordion state and links the button to its panel. (Audit A28.) */}
              <button
                className="pr-faq-q"
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                aria-controls={`pr-faq-panel-${i}`}
                id={`pr-faq-q-${i}`}
              >
                <span>{f.q}</span>
                {open === i ? <Minus size={18} className="pr-ico" /> : <Plus size={18} className="pr-ico" />}
              </button>
              <div className="pr-faq-a" id={`pr-faq-panel-${i}`} role="region" aria-labelledby={`pr-faq-q-${i}`}>
                <p>{f.a}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="pr-faq-more">
          Still curious?{" "}
          <a href={waLink("Hi! I have a question about your tours.")} target="_blank" rel="noreferrer">
            Ask us on WhatsApp →
          </a>
        </p>
      </div>
    </section>
  );
}
