import type { Metadata } from "next";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { waLink } from "@/lib/whatsapp";

// This page has no D1 dependency of its own, but [lang]/layout.tsx's Footer
// does (listTours() -> getCloudflareContext()), which isn't available
// during the static build-time prerender generateStaticParams triggers for
// "en" -- same fix as [lang]/page.tsx, see that file's comment.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `Privacy Policy -- ${BUSINESS_NAME}`,
    alternates: { canonical: `${SITE_URL}/${lang}/privacy` },
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return (
    <article className="pr-legal">
      <div className="pr-wrap pr-wrap-narrow">
        <h1>Privacy Policy</h1>
        <p className="pr-legal-updated">Last updated: 12 July 2026</p>

        <p>
          {BUSINESS_NAME}, referred to as &quot;we&quot;, &quot;us&quot; or &quot;our&quot;, operates the website at phuketrafting.com
          and provides white-water rafting, zipline, ATV and riverside camping tours in Phang Nga, Thailand. This
          policy explains what personal data we collect, why, and what rights you have over it, in line with
          Thailand&apos;s Personal Data Protection Act B.E. 2562 (2019) (&quot;PDPA&quot;).
        </p>

        <h2>1. Who is responsible for your data</h2>
        <p>
          {BUSINESS_NAME} is the data controller for personal data collected through this website and our booking
          and communication channels. You can reach us using the contact details in section 8, or by{" "}
          <a href={waLink("Hi! I have a question about your Privacy Policy.")} target="_blank" rel="noreferrer">
            messaging us on WhatsApp
          </a>
          .
        </p>

        <h2>2. What we collect, and why</h2>
        <table className="pr-legal-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Collected when</th>
              <th>Purpose</th>
              <th>Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, email, phone number</td>
              <td>You send an enquiry, book a tour, or message us on WhatsApp</td>
              <td>Respond to you, arrange your booking, send confirmations and pickup details</td>
              <td>Performance of a contract / your consent</td>
            </tr>
            <tr>
              <td>Message content</td>
              <td>You submit the enquiry form or chat with us</td>
              <td>Understand and answer your question</td>
              <td>Performance of a contract / legitimate interest</td>
            </tr>
            <tr>
              <td>Marketing consent flag</td>
              <td>You tick (or leave unticked) the marketing checkbox on the enquiry form, or accept/decline cookies</td>
              <td>Only send marketing email if you said yes; prove that choice if ever asked</td>
              <td>Consent</td>
            </tr>
            <tr>
              <td>IP address, browser/device info</td>
              <td>Every visit to the site</td>
              <td>Security (bot and abuse prevention on forms), analytics, fixing bugs</td>
              <td>Legitimate interest</td>
            </tr>
            <tr>
              <td>Cookies / analytics identifiers</td>
              <td>Only after you accept the cookie banner</td>
              <td>Understand how visitors use the site (Google Analytics)</td>
              <td>Consent</td>
            </tr>
            <tr>
              <td>Payment details</td>
              <td>When online payment is available and you pay a deposit</td>
              <td>Process your payment</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Health/fitness self-declaration</td>
              <td>Before an activity that requires it (e.g. rafting, ATV)</td>
              <td>Assess whether the activity is safe for you, brief our guides</td>
              <td>Consent / vital interests (your safety)</td>
            </tr>
          </tbody>
        </table>

        <h2>3. Who we share it with</h2>
        <p>
          We do not sell your personal data. We share it only with service providers who help us run the business,
          under contracts that require them to protect it. Several of these are based outside Thailand, which under
          the PDPA counts as a cross-border transfer:
        </p>
        <ul>
          <li>
            <strong>Cloudflare</strong> (USA/global) -- hosting, database, bot protection, and content delivery for
            this website.
          </li>
          <li>
            <strong>Stripe</strong> (USA/global) -- payment processing, if you pay online.
          </li>
          <li>
            <strong>Twilio</strong> (USA/global) -- WhatsApp messaging for booking communication.
          </li>
          <li>
            <strong>Brevo</strong> (France/EU) -- transactional email (booking confirmations, enquiry notifications).
          </li>
          <li>
            <strong>MiniMax</strong> -- AI-assisted translation and content tooling; does not receive your personal
            data as part of normal browsing.
          </li>
          <li>
            <strong>Google</strong> (USA/global) -- website analytics (Google Analytics), only if you accept
            analytics cookies.
          </li>
        </ul>
        <p>
          We may also disclose data if required by Thai law or to protect the safety of guests and staff during an
          activity.
        </p>

        <h2>4. How long we keep it</h2>
        <ul>
          <li>Enquiry-form submissions that don&apos;t turn into a booking: up to 24 months, then deleted.</li>
          <li>
            Booking records (guest identity, activity, payment status): kept for our accounting and legal
            obligations, generally up to 5 years.
          </li>
          <li>Consent records (cookie choices, marketing opt-ins): kept for as long as needed to demonstrate consent, typically the life of the relationship plus 2 years.</li>
          <li>WhatsApp/chat transcripts: kept while relevant to an active or recent booking, then deleted or anonymized.</li>
        </ul>

        <h2>5. Your rights</h2>
        <p>Under the PDPA, you have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you;</li>
          <li>Request correction of inaccurate data;</li>
          <li>Request deletion or anonymization of your data;</li>
          <li>Request a copy of your data in a portable format;</li>
          <li>Object to or restrict certain processing;</li>
          <li>Withdraw consent at any time (this doesn&apos;t affect processing already carried out).</li>
        </ul>
        <p>
          To exercise any of these rights, contact us using the details in section 8. If you&apos;re not satisfied
          with our response, you have the right to complain to Thailand&apos;s Personal Data Protection Committee
          (PDPC).
        </p>

        <h2>6. Cookies</h2>
        <p>
          Essential cookies (like bot protection on our forms) run regardless of your choice, since the site can&apos;t
          function safely without them. Analytics cookies only run if you accept them via the cookie banner shown on
          your first visit -- you can change your mind at any time by clearing your browser&apos;s cookies for this
          site and revisiting.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard measures (encrypted connections, access controls, bot protection on public forms)
          to protect your data. No online system is 100% secure, but we take reasonable steps appropriate to the
          data we hold.
        </p>

        <h2>8. Contact us</h2>
        <p>
          For any question about this policy or your personal data, message us on{" "}
          <a href={waLink("Hi! I have a question about your Privacy Policy.")} target="_blank" rel="noreferrer">
            WhatsApp
          </a>{" "}
          or use the <a href={`/${lang}#contact`}>contact form</a> on our homepage.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time as our services or the law change. The &quot;Last updated&quot;
          date at the top shows when it was last revised.
        </p>
      </div>
    </article>
  );
}
