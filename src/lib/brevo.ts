import { getCloudflareContext } from "@opennextjs/cloudflare";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

interface EnquiryNotification {
  name: string;
  email: string;
  phone: string;
  message: string;
  locale: string;
}

/**
 * Best-effort notification to the business inbox for a new enquiry --
 * plan §3 calls this flow out as explicitly "fail-open": the D1 row
 * (inserted before this is ever called) is the durable record of the
 * enquiry, so a Brevo outage must never turn a real lead into a user-facing
 * error. Callers should not await this inline in the success path; wrap in
 * try/catch (or don't await at all) and log, never throw.
 *
 * No-ops (does not throw) if BREVO_SENDER_EMAIL/BREVO_NOTIFY_EMAIL aren't
 * configured yet -- lets the rest of the enquiry flow work end-to-end
 * before those business-specific addresses are set.
 */
export async function sendEnquiryNotification(enquiry: EnquiryNotification): Promise<void> {
  const { env } = getCloudflareContext();
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const notifyEmail = env.BREVO_NOTIFY_EMAIL;

  if (!apiKey || !senderEmail || !notifyEmail) {
    return;
  }

  const html = `
    <p><strong>New enquiry from the website</strong></p>
    <p><strong>Name:</strong> ${escapeHtml(enquiry.name)}<br/>
       <strong>Email:</strong> ${escapeHtml(enquiry.email)}<br/>
       <strong>Phone:</strong> ${escapeHtml(enquiry.phone || "-")}<br/>
       <strong>Locale:</strong> ${escapeHtml(enquiry.locale)}</p>
    <p><strong>Message:</strong><br/>${escapeHtml(enquiry.message).replace(/\n/g, "<br/>")}</p>
  `;

  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: "Phuket Rafting Website" },
      to: [{ email: notifyEmail }],
      replyTo: { email: enquiry.email, name: enquiry.name },
      subject: `New enquiry from ${enquiry.name}`,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo send failed: ${response.status}`);
  }
}

interface BookingReceivedEmail {
  guestName: string;
  guestEmail: string;
  productName: string;
  date: string;
  total: number;
  currency: string;
}

/**
 * Sent TO the guest by staff clicking "Notify guest" on a booking (plan §2:
 * "email says 'Booking Received' never 'Confirmed'; all guest notifications
 * are explicit staff button-clicks"). Unlike sendEnquiryNotification, this
 * is NOT fail-open at this layer -- it throws on a real send failure so the
 * caller (dashboard/bookings/actions.ts's notifyGuestEmail) can record
 * last_email_status='failed' and let staff see and retry, instead of a
 * silently-swallowed failure looking like a successful send.
 *
 * No-ops if BREVO_API_KEY/BREVO_SENDER_EMAIL aren't configured -- same
 * "let the rest of the flow work before business addresses exist" reasoning
 * as sendEnquiryNotification -- but unlike that fire-and-forget background
 * effect, this one's caller needs to tell a no-op apart from a real send:
 * returns false for "not configured, nothing was sent" vs true for "Brevo
 * actually accepted it", so notifyGuestEmail can record
 * last_email_status='not_configured' instead of the misleading 'sent'.
 * (Confirmed live: before this return value existed, a misconfigured Brevo
 * made every send look like a genuine success in the dashboard/audit log.)
 */
export async function sendBookingReceivedEmail(booking: BookingReceivedEmail): Promise<boolean> {
  const { env } = getCloudflareContext();
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    return false;
  }

  const totalFormatted = `฿${booking.total.toLocaleString("en-US")}`;
  const html = `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p>We've received your booking request -- <strong>this confirms we have it, not that it's fully confirmed yet</strong>.
       Our team will be in touch with pickup details shortly.</p>
    <p><strong>Booking:</strong> ${escapeHtml(booking.productName)}<br/>
       <strong>Date:</strong> ${escapeHtml(booking.date)}<br/>
       <strong>Total:</strong> ${totalFormatted} ${escapeHtml(booking.currency)}</p>
    <p>Questions? Just reply to this email or message us on WhatsApp.</p>
  `;

  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: "Phuket Rafting" },
      to: [{ email: booking.guestEmail, name: booking.guestName }],
      subject: `Booking received -- ${booking.productName}`,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo send failed: ${response.status}`);
  }
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
