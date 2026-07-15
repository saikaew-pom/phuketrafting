import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBookingByManageToken } from "@/lib/queries/bookings";
import { baht } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { ManageBookingRequestForm } from "@/components/public/ManageBookingRequestForm";

// Same fix as privacy/terms/waiver -- this page also renders through
// [lang]/layout.tsx's Footer (listTours() -> getCloudflareContext()), which
// isn't available during the static build-time prerender.
export const dynamic = "force-dynamic";

// A guest-specific page keyed by a private link -- must never be indexed or
// listed anywhere search engines crawl.
export const metadata: Metadata = {
  title: "Manage your booking",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByManageToken(token);
  if (!booking) notFound();

  const guestCount = [
    booking.adults ? `${booking.adults} adult${booking.adults === 1 ? "" : "s"}` : null,
    booking.children ? `${booking.children} child${booking.children === 1 ? "" : "ren"}` : null,
    booking.infants ? `${booking.infants} infant${booking.infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const canRequestChange = booking.status === "pending" || booking.status === "confirmed";

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
          Status: {STATUS_LABEL[booking.status] ?? booking.status}
          <br />
          Total: {baht(booking.total)} {booking.currency}
        </p>
        <p>
          Booked under: {booking.guest_name}
          {booking.guest_email && <> -- {booking.guest_email}</>}
          {booking.guest_phone && <> -- {booking.guest_phone}</>}
        </p>

        <h2>Cancellation &amp; reschedule policy</h2>
        {/* 72h window is a proposed value pending client sign-off (plan §14,
            "Cancellation window" open item) -- not yet wired to the settings
            table (unused anywhere in this codebase today; building a
            settings get/set layer is out of scope for this chunk). Update
            this text if/when the real number is confirmed. */}
        <p>
          Free cancellation or reschedule up to 72 hours before departure (full deposit refund). Inside 72 hours,
          the deposit is forfeited. If we ever need to cancel for weather or safety reasons, you&apos;ll always get a
          full refund or a free reschedule.
        </p>

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
