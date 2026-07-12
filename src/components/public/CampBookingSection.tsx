import { SectionHead } from "@/components/public/SectionHead";
import { CampBookingWidget, type CampZoneOption } from "@/components/public/CampBookingWidget";

export function CampBookingSection({ zones, locale }: { zones: CampZoneOption[]; locale: string }) {
  return (
    <section className="pr-section" id="camp-book">
      <div className="pr-wrap">
        <SectionHead
          eyebrow="Riverside camping"
          title="Reserve your campsite"
          sub="Wake up to the sound of the rapids -- pick your dates and we'll hold your spot."
        />
        <CampBookingWidget zones={zones} locale={locale} />
      </div>
    </section>
  );
}
