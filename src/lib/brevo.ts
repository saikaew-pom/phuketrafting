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
  // Absolute URL to the guest self-service page, or null if the booking has
  // no manage_token (shouldn't happen for anything created after this
  // feature shipped, but older/edge-case rows could still be null) --
  // computed by the caller (dashboard/bookings/actions.ts) from the actual
  // request Host header, NOT lib/site.ts's SITE_URL: that constant is the
  // eventual custom domain, which isn't pointed at this Worker yet (DNS
  // cutover is Phase 9) -- an email link must work on whatever origin is
  // actually live right now.
  manageUrl: string | null;
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
    ${booking.manageUrl ? `<p><a href="${escapeHtml(booking.manageUrl)}">View or manage your booking</a></p>` : ""}
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

interface ManageRequestNotification {
  bookingId: string;
  guestName: string;
  productName: string;
  requestType: "cancel" | "reschedule";
  message: string;
}

/**
 * Best-effort notification to the business inbox when a guest submits a
 * cancel/reschedule request from the manage-booking page (plan §2: "requests
 * reschedule/cancel -- creates a request for staff, never auto-mutates").
 * The durable record of the request is the booking_logs row written by the
 * caller (manage-actions.ts) BEFORE this is called -- same fail-open
 * reasoning as sendEnquiryNotification: staff can always find the request on
 * the booking's Activity log even if this email never arrives, so a Brevo
 * outage must never turn a real guest request into a lost one.
 */
export async function sendManageRequestNotification(req: ManageRequestNotification): Promise<void> {
  const { env } = getCloudflareContext();
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const notifyEmail = env.BREVO_NOTIFY_EMAIL;

  if (!apiKey || !senderEmail || !notifyEmail) {
    return;
  }

  const label = req.requestType === "cancel" ? "Cancellation" : "Reschedule";
  const html = `
    <p><strong>${label} request from a guest</strong></p>
    <p><strong>Booking:</strong> ${escapeHtml(req.productName)} (#${escapeHtml(req.bookingId)})<br/>
       <strong>Guest:</strong> ${escapeHtml(req.guestName)}</p>
    ${req.message ? `<p><strong>Message:</strong><br/>${escapeHtml(req.message).replace(/\n/g, "<br/>")}</p>` : ""}
    <p>Review in the dashboard: /dashboard/bookings/${escapeHtml(req.bookingId)}</p>
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
      subject: `${label} request -- ${req.guestName} (${req.productName})`,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo send failed: ${response.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
