import { SectionHead } from "@/components/public/SectionHead";
import { EnquiryForm } from "@/components/public/EnquiryForm";

export function EnquirySection({ locale }: { locale: string }) {
  return (
    <section className="pr-section pr-section-tint" id="contact">
      <div className="pr-wrap pr-wrap-narrow">
        <SectionHead
          center
          eyebrow="Prefer email?"
          title="Send us a message"
          sub="Rather not use WhatsApp? Drop us a note and we'll get back to you."
        />
        <EnquiryForm locale={locale} />
      </div>
    </section>
  );
}
