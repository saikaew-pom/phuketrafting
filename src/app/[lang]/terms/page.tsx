import type { Metadata } from "next";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { waLink } from "@/lib/whatsapp";

// See privacy/page.tsx's comment -- same fix, same reason.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `Terms of Service -- ${BUSINESS_NAME}`,
    alternates: { canonical: `${SITE_URL}/${lang}/terms` },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return (
    <article className="pr-legal">
      <div className="pr-wrap pr-wrap-narrow">
        <h1>Terms of Service</h1>
        <p className="pr-legal-updated">Last updated: 12 July 2026</p>

        <p>
          These terms govern your use of the {BUSINESS_NAME} website (phuketrafting.com) and your booking of any
          tour, activity, or camping stay with us. By using the website or making a booking, you agree to these
          terms. Please also read our{" "}
          <a href={`/${lang}/privacy`}>Privacy Policy</a> and, if you&apos;re joining a rafting, ATV, zipline or
          other adventure activity, our <a href={`/${lang}/waiver`}>Assumption of Risk &amp; Liability Waiver</a>.
        </p>

        <h2>1. Who we are</h2>
        <p>
          {BUSINESS_NAME} is a tour operator based in Phang Nga, Thailand, operating since 2002. We arrange
          white-water rafting, zipline, ATV and riverside camping experiences.
        </p>

        <h2>2. Bookings and reservations</h2>
        <ul>
          <li>
            Reservations made through WhatsApp or our contact form are provisional until we confirm availability
            and, where applicable, receive any required deposit.
          </li>
          <li>Prices shown on the website are per person unless stated otherwise, and are subject to change until a booking is confirmed.</li>
          <li>
            You must provide accurate details for everyone in your group (including ages, where age-banded pricing
            applies) so we can plan the activity, transfers and safety briefing correctly.
          </li>
          <li>
            Where online payment is available, payment terms (deposit amount, balance due, accepted methods) will be
            shown at checkout before you pay.
          </li>
        </ul>

        <h2>3. Cancellations and changes</h2>
        <ul>
          <li>Tell us as early as possible if you need to cancel or reschedule -- message us on WhatsApp with your booking details.</li>
          <li>
            Where a deposit has been paid, our cancellation and refund policy will be confirmed to you at the time
            of booking and shown at checkout.
          </li>
          <li>
            We may need to reschedule or cancel an activity for safety reasons (e.g. river conditions, severe
            weather). In that case we will offer an alternative date or a full refund of any amount paid for the
            affected activity.
          </li>
        </ul>

        <h2>4. Health, fitness and conduct</h2>
        <p>
          Rafting, ATV and zipline activities are physically demanding and carry inherent risk. You are responsible
          for telling us about any medical condition, injury, pregnancy, or fitness limitation that could affect
          your (or others&apos;) safety before the activity begins. We may refuse participation, at our guides&apos;
          reasonable discretion, if we believe an activity is unsafe for a particular guest. See our{" "}
          <a href={`/${lang}/waiver`}>Waiver</a> for the full assumption-of-risk terms.
        </p>

        <h2>5. Website use</h2>
        <ul>
          <li>You agree not to misuse this website -- including attempting to bypass security controls, submit false information through our forms, or send abusive/spam messages.</li>
          <li>Content on this site (text, photos, logo) belongs to {BUSINESS_NAME} or its licensors and may not be reused without permission.</li>
        </ul>

        <h2>6. Liability</h2>
        <p>
          Nothing in these terms limits our liability where it would be unlawful to do so under Thai law (for
          example, liability for death or personal injury caused by our negligence). Subject to that, our liability
          for issues arising from your booking is limited to the amount you paid for the affected activity.
        </p>

        <h2>7. Governing law</h2>
        <p>These terms are governed by the laws of Thailand. Any dispute will be subject to the jurisdiction of the Thai courts.</p>

        <h2>8. Changes to these terms</h2>
        <p>We may update these terms from time to time. The &quot;Last updated&quot; date above shows the latest revision.</p>

        <h2>9. Contact</h2>
        <p>
          Questions about these terms?{" "}
          <a href={waLink("Hi! I have a question about your Terms of Service.")} target="_blank" rel="noreferrer">
            Message us on WhatsApp
          </a>
          .
        </p>
      </div>
    </article>
  );
}
