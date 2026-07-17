import { SectionHead } from "@/components/public/SectionHead";
import { CampBookingWidget, type CampZoneOption } from "@/components/public/CampBookingWidget";
import type { BookingAddonOption } from "@/components/public/BookingWidget";

export function CampBookingSection({
  zones,
  addons,
  locale,
}: {
  zones: CampZoneOption[];
  addons: BookingAddonOption[];
  locale: string;
}) {
  return (
    <section className="pr-section" id="camp-book">
      <div className="pr-wrap">
        <SectionHead
          eyebrow="Riverside camping"
          title="Reserve your campsite"
          sub="Wake up to the sound of the rapids -- pick your dates and we'll hold your spot."
        />
        <CampBookingWidget zones={zones} addons={addons} locale={locale} />
      </div>
    </section>
  );
}
