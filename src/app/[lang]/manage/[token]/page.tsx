import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBookingByManageToken } from "@/lib/queries/bookings";
import { listBookingAddons } from "@/lib/queries/addons";
import { listParticipants } from "@/lib/queries/participants";
import { getPaymentPolicy, isWithinCancellationWindow } from "@/lib/queries/settings";
import { baht } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { ManageBookingRequestForm } from "@/components/public/ManageBookingRequestForm";
import { WaiverForm, type WaiverRow } from "@/components/public/WaiverForm";

// Same fix as privacy/terms/waiver -- this page also renders through
// [lang]/layout.tsx's Footer (listTours() -> getCloudflareContext()), which
// isn't available during the static build-time prerender.
export const dynamic = "force-dynamic";

// A guest-specific page keyed by a private link -- must never be indexed or
// listed anywhere search engines crawl. referrer: "no-referrer" is
// belt-and-braces alongside the Analytics.tsx redaction below -- this route's
// manage_token is a real capability (cancel/reschedule request, waiver
// submission), and even with GA4's page_location itself now redacted, an
// outbound link a guest clicks FROM this page should not carry the token in
// the Referer header to that third party either.
export const metadata: Metadata = {
  title: "Manage your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export default async function ManageBookingPage({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { lang, token } = await params;
  const booking = await getBookingByManageToken(token);
  if (!booking) notFound();

  const participants = await listParticipants(booking.id);
  const bookingAddons = await listBookingAddons(booking.id);
  const policy = await getPaymentPolicy();
  // null = we can't tell (no date on file / unparseable). Deliberately NOT
  // treated as "inside": telling a guest their deposit is refundable when we
  // don't actually know is a promise we might not keep.
  const withinWindow = isWithinCancellationWindow(booking.date, policy.cancellationWindowHours);

  const guestCount = [
    booking.adults ? `${booking.adults} adult${booking.adults === 1 ? "" : "s"}` : null,
    booking.children ? `${booking.children} child${booking.children === 1 ? "" : "ren"}` : null,
    booking.infants ? `${booking.infants} infant${booking.infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const canRequestChange = booking.status === "pending" || booking.status === "confirmed";

  // Everyone physically on the trip needs their own waiver, infants included
  // -- plan §7's "the booker's checkbox alone doesn't cover companions", and
  // §7 again on minors ("a parent or legal guardian must review and sign this
  // waiver on behalf of any participant under 18"). This is deliberately NOT
  // the capacity headcount (adults + children, which excludes infants because
  // they don't consume a seat) -- a seat and a liability waiver are different
  // things, and an infant on the raft needs the latter regardless.
  const participantCount = booking.adults + booking.children + booking.infants;
  const canSignWaivers = booking.status !== "cancelled" && booking.status !== "no_show";
  const signedCount = participants.filter((p) => p.waiver_signed_at !== null).length;

  // Prefill from what's already on file so a guest correcting one typo isn't
  // made to retype the whole family; falls back to empty rows for a booking
  // with no waivers yet. replaceParticipants is a replace-all, so the form
  // must always render the complete set, not just the missing ones.
  const initialRows: WaiverRow[] = Array.from({ length: participantCount }, (_, i) => ({
    name: participants[i]?.name ?? "",
    age: participants[i]?.age?.toString() ?? "",
    health: participants[i]?.health_declaration ?? "",
    signature: participants[i]?.signature_text ?? "",
  }));

  return (
    <article className="pr-legal">
      <div className="pr-wrap pr-wrap-narrow">
        <h1>Your booking</h1>

        {/* Guest-safe fields only, picked explicitly -- never spread the raw
            BookingDetail object here. It also carries staff-internal columns
            (notes, source, booked_by_agent_id, promo_code_id,
            stripe_checkout_session_id, last_email/whatsapp_status, and
            manage_token itself) that must never render back to the guest. */}
        <p>
          <strong>{booking.product_name ?? "Booking"}</strong>
          <br />
          {booking.date && <>Date: {booking.date}</>}
          {booking.check_out && booking.type === "camp" && <> -- {booking.check_out}</>}
        </p>
        <p>
          Guests: {guestCount || "--"}
          <br />
          {booking.pickup_zone_name && (
            <>
              Pickup: {booking.pickup_zone_name}
              <br />
            </>
          )}
          {booking.hotel && (
            <>
              Hotel: {booking.hotel}
              <br />
            </>
          )}
          {booking.addon_choice && (
            <>
              Add-on: {booking.addon_choice}
              <br />
            </>
          )}
          {bookingAddons.map((a, i) => (
            <span key={i}>
              Extra: {a.name_at_booking} ({baht(a.price_at_booking)})
              <br />
            </span>
          ))}
          Status: {STATUS_LABEL[booking.status] ?? booking.status}
          <br />
          Total: {baht(booking.total)} {booking.currency}
        </p>
        <p>
          Booked under: {booking.guest_name}
          {booking.guest_email && <> -- {booking.guest_email}</>}
          {booking.guest_phone && <> -- {booking.guest_phone}</>}
        </p>

        <h2>Waivers</h2>
        {canSignWaivers ? (
          <>
            <p>
              {signedCount === 0
                ? `Every participant needs their own signed waiver before departure -- ${participantCount} to complete.`
                : signedCount < participantCount
                  ? `${signedCount} of ${participantCount} waivers signed. Please complete the rest before departure.`
                  : `All ${participantCount} waivers are signed and on file. You can update them below if anything changes.`}
            </p>
            <WaiverForm
              manageToken={token}
              lang={lang}
              participantCount={participantCount}
              initialRows={initialRows}
              waiverHref={`/${lang}/waiver`}
            />
          </>
        ) : (
          <p>This booking is no longer active, so waivers can&apos;t be signed here.</p>
        )}

        <h2>Cancellation &amp; reschedule policy</h2>
        {/* The window is read from settings, not hardcoded: plan §14 still
            lists the 72h rule as awaiting client sign-off, so a different
            number must be a data change rather than a deploy. */}
        <p>
          Free cancellation or reschedule up to {policy.cancellationWindowHours} hours before departure (full deposit
          refund). Inside {policy.cancellationWindowHours} hours, the deposit is forfeited. If we ever need to cancel
          for weather or safety reasons, you&apos;ll always get a full refund or a free reschedule.
        </p>
        {/* Tells the guest where THEY actually stand, rather than making them
            work it out from the policy and their departure date. Only shown
            when there's a deposit at stake and we can genuinely tell. */}
        {withinWindow !== null && booking.deposit_amount > 0 && canRequestChange && (
          <p>
            <strong>
              {withinWindow
                ? `You're still inside the free window -- cancel now and your ${baht(booking.deposit_amount)} deposit is refunded in full.`
                : `You're now inside ${policy.cancellationWindowHours} hours of departure, so your ${baht(booking.deposit_amount)} deposit is non-refundable. You can still request a change and we'll do what we can.`}
            </strong>
          </p>
        )}

        {canRequestChange ? (
          <>
            <h2>Need to change something?</h2>
            <p>
              Submitting a request doesn&apos;t change your booking automatically -- our team reviews every request
              and confirms with you by email or WhatsApp.
            </p>
            <ManageBookingRequestForm manageToken={token} />
          </>
        ) : (
          <p>
            This booking is {STATUS_LABEL[booking.status]?.toLowerCase() ?? booking.status} and can no longer be
            changed here.
          </p>
        )}

        <p>
          Questions?{" "}
          <a href={waLink(`Hi! I have a question about my booking (${booking.product_name ?? ""}).`)} target="_blank" rel="noreferrer">
            Message us on WhatsApp
          </a>
          .
        </p>
      </div>
    </article>
  );
}
