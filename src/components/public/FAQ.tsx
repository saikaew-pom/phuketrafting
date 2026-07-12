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
              <button className="pr-faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{f.q}</span>
                {open === i ? <Minus size={18} className="pr-ico" /> : <Plus size={18} className="pr-ico" />}
              </button>
              <div className="pr-faq-a">
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
