import type { Metadata } from "next";
import { BUSINESS_NAME, SITE_URL } from "@/lib/site";
import { waLink } from "@/lib/whatsapp";

// See privacy/page.tsx's comment -- same fix, same reason.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `Assumption of Risk & Liability Waiver -- ${BUSINESS_NAME}`,
    alternates: { canonical: `${SITE_URL}/${lang}/waiver` },
    robots: { index: true, follow: true },
  };
}

export default function WaiverPage() {
  return (
    <article className="pr-legal">
      <div className="pr-wrap pr-wrap-narrow">
        <h1>Assumption of Risk &amp; Liability Waiver</h1>
        <p className="pr-legal-updated">Last updated: 12 July 2026</p>

        <p>
          This page explains the risks of the activities we run and the waiver every participant (or, for minors, a
          parent/guardian) agrees to before joining. A signed copy of this waiver is collected in person at
          check-in before your activity begins -- reading it here in advance means no surprises on the day.
        </p>

        <h2>1. Nature of the activities</h2>
        <p>
          White-water rafting, ziplining, ATV riding, elephant trekking and riverside camping are outdoor adventure
          activities that take place in a natural jungle and river environment. By their nature they involve risks
          that cannot be eliminated even with proper safety equipment, trained guides and careful operation,
          including but not limited to:
        </p>
        <ul>
          <li>Falls, collisions, capsizing, or being thrown from a raft, ATV, or zipline harness;</li>
          <li>Drowning or near-drowning, cuts, bruises, sprains, fractures, or other injury;</li>
          <li>Exposure to wildlife, insects, uneven or slippery terrain, and changing weather or river conditions;</li>
          <li>Equipment malfunction, despite regular inspection and maintenance.</li>
        </ul>

        <h2>2. Assumption of risk</h2>
        <p>
          By participating, you acknowledge that these risks exist, that you are voluntarily choosing to
          participate with full knowledge of them, and that you assume personal responsibility for any injury,
          loss, or damage that results from these inherent risks -- except where caused by our proven negligence.
        </p>

        <h2>3. Health and fitness declaration</h2>
        <p>You confirm, to the best of your knowledge, that:</p>
        <ul>
          <li>You are in good health and physically able to take part in the activity you&apos;ve booked;</li>
          <li>You have disclosed to us any heart condition, back/spine issue, pregnancy, recent surgery, or other condition that could make the activity unsafe for you;</li>
          <li>You are not participating under the influence of alcohol or drugs.</li>
        </ul>
        <p>
          Our guides may refuse or stop your participation at any point if they reasonably believe continuing would
          be unsafe for you or others.
        </p>

        <h2>4. Guests under 18</h2>
        <p>
          A parent or legal guardian must review and sign this waiver on behalf of any participant under 18, and
          confirms they have the authority to do so and accept these terms on the minor&apos;s behalf.
        </p>

        <h2>5. Release and indemnity</h2>
        <p>
          To the fullest extent permitted by Thai law, you release {BUSINESS_NAME}, its owners, guides and staff
          from liability for injury, loss or damage arising from the inherent risks described above, and agree to
          indemnify us against claims arising from your own negligent or reckless conduct during the activity. This
          release does not limit liability that cannot lawfully be excluded, including liability for death or
          personal injury caused by our own negligence.
        </p>

        <h2>6. Photo and video release</h2>
        <p>
          We may take photos or video during your activity for safety records and, unless you tell us otherwise at
          check-in, for use in our marketing (website, social media). Let your guide know before your activity
          starts if you&apos;d prefer not to be included.
        </p>

        <h2>7. Governing law</h2>
        <p>This waiver is governed by the laws of Thailand.</p>

        <h2>8. Questions before you arrive</h2>
        <p>
          If you have any question about the activity, the risks involved, or whether it&apos;s suitable for
          someone in your group, ask us before you book --{" "}
          <a href={waLink("Hi! I have a question about safety and the activity waiver before booking.")} target="_blank" rel="noreferrer">
            message us on WhatsApp
          </a>
          .
        </p>
      </div>
    </article>
  );
}
