import Image from "next/image";
import { MapPin, MessageCircle, CalendarCheck } from "lucide-react";
import { waLink } from "@/lib/whatsapp";

const FINALCTA_IMAGE_ID = "nefv70opn9cdgw7un7nw";

export function FinalCTA() {
  return (
    <section className="pr-finalcta" id="book">
      <div className="pr-finalcta-bg">
        <Image src={FINALCTA_IMAGE_ID} alt="Phang Nga jungle river" fill sizes="100vw" />
        <div className="pr-finalcta-scrim" />
      </div>
      <div className="pr-wrap pr-finalcta-inner">
        <span className="pr-pill pr-pill-glass">
          <MapPin size={14} className="pr-ico" /> Phang Nga, Thailand
        </span>
        <h2>Your jungle adventure is one message away.</h2>
        <p>Reserve your date with a small deposit, pay the balance on the day, and let the pros handle the rest. Let&apos;s go wild.</p>
        <div className="pr-finalcta-actions">
          {/* The booking form, not a chat. This is the page's closing CTA --
              "Reserve your spot" opening WhatsApp meant the last thing a
              convinced guest clicked never reached the booking engine. The
              WhatsApp option stays alongside it for people who'd rather talk. */}
          <a className="pr-btn pr-btn-accent pr-btn-lg" href="#top">
            <CalendarCheck size={18} className="pr-ico" /> Reserve your spot
          </a>
          <a
            className="pr-btn pr-btn-glass pr-btn-lg"
            href={waLink("Hi! I'd like to book an adventure.")}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} className="pr-ico" /> +66 65 010 2184
          </a>
        </div>
      </div>
    </section>
  );
}
