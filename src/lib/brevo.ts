import { getCloudflareContext } from "@opennextjs/cloudflare";
import { GOOGLE_REVIEW_URL, BUSINESS_NAME, BUSINESS_PHONE } from "@/lib/site";
import { baht } from "@/lib/format";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * The Brevo-related bindings, however they were obtained.
 *
 * Every function here resolves its config through resolveBrevoConfig, which
 * defaults to getCloudflareContext() -- correct for the Server Action callers
 * (enquiry form, staff notify button), which always run inside a request.
 * The cron callers (lib/cron/scheduled-notifications.ts) do NOT: OpenNext
 * only populates the context's AsyncLocalStorage store during a fetch, so
 * getCloudflareContext() throws in a scheduled() invocation. They pass `env`
 * in explicitly instead. Optional param rather than a required one so the
 * existing callers are untouched.
 */
export interface BrevoConfig {
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_NOTIFY_EMAIL?: string;
}

function resolveBrevoConfig(config?: BrevoConfig): BrevoConfig {
  return config ?? getCloudflareContext().env;
}

/**
 * Header-destined fields must never carry CR/LF -- the body-content equivalent
 * of escapeHtml below. Every guest-supplied name/subject that flows into this
 * file goes through Zod schemas bounded with `.trim()`, which strips only
 * LEADING/TRAILING whitespace -- an INTERIOR "\r\nBcc: attacker@evil.com" in a
 * guest name survives validation intact and previously reached Brevo's JSON
 * body raw. The transport is JSON (JSON.stringify escapes CR/LF as \r\n
 * sequences), so exploiting this into a real header injection would require
 * Brevo's own MIME encoder to un-escape and pass them through -- not verified
 * either way -- but this file performed zero sanitization on these fields and
 * relied entirely on an untested third-party guarantee to do it instead.
 * Applied once in sendViaBrevo, the one chokepoint every send passes through,
 * so no future caller can reintroduce the gap by forgetting to call this.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Fires one Brevo send. Every function below builds a subject + HTML body
 * (via renderEmailLayout) and hands it here -- this is the one place that
 * actually talks to the API, so the fetch call, headers and error handling
 * exist exactly once.
 */
async function sendViaBrevo(params: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  replyTo?: { email: string; name?: string };
}): Promise<void> {
  // Bounded, like the Stripe client's own 8s cap: sendBookingAck is awaited
  // inline before a booking action returns "Booked!", and it makes two
  // sequential sends -- a hung Brevo (no response, TCP just stalls) would
  // otherwise leave the guest waiting indefinitely, conclude it failed, and
  // rebook, double-claiming a seat. It also serially stalls the daily
  // notification cron (40 guests x hang). A timeout turns "hung" into a normal
  // failed send that the caller's fail-open path already handles. (Audit A8.)
  let response: Response;
  try {
    response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: { "api-key": params.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: params.senderEmail, name: params.senderName },
        to: params.to.map((t) => (t.name ? { ...t, name: sanitizeHeader(t.name) } : t)),
        ...(params.replyTo
          ? { replyTo: params.replyTo.name ? { ...params.replyTo, name: sanitizeHeader(params.replyTo.name) } : params.replyTo }
          : {}),
        subject: sanitizeHeader(params.subject),
        htmlContent: params.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // AbortError (timeout) or a network error -- surface as the same "send
    // failed" the callers already try/catch, rather than a raw TimeoutError.
    throw new Error(`Brevo send failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    // Include the response body -- Brevo's JSON error (bad sender, invalid
    // recipient) is the diagnostic part, and it's what lands in booking_logs /
    // cron logs. Truncated so a huge body can't bloat a log row. (Audit A30.)
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo send failed: ${response.status}${detail ? ` ${detail.slice(0, 300)}` : ""}`);
  }
}

/**
 * The shared branded shell every outgoing email renders through -- plan §4's
 * "our own ... emails via Brevo" was built five times over as bare, unstyled
 * `<p>` fragments with no header, no footer and nothing that identified who
 * the email was from beyond the sender name. One layout means one place to
 * keep the brand consistent, and it means the enquiry/staff-notification
 * emails (nobody ever asked for those to look nice) get the same polish as
 * the guest-facing ones for free.
 *
 * Table-based markup with every rule inlined, deliberately -- not because
 * that's good CSS, but because it's the only approach that survives Outlook
 * desktop (Word's rendering engine, no support for <style> blocks or most
 * modern CSS) as well as Gmail's stripped-<head> clipping. A system font
 * stack, not next/font's Sora/Plus-Jakarta-Sans: web fonts don't load in
 * most email clients, and a family list that silently falls through to the
 * platform default is safer than shipping a broken @font-face.
 *
 * `preheader` is the hidden snippet inbox lists show next to the subject
 * line (Gmail/Outlook/Apple Mail all read it) -- without one, clients fall
 * back to quoting the email's own first visible text, which for a
 * template that opens on a logo is usually blank or a stray fragment.
 */
function renderEmailLayout(opts: { preheader: string; bodyHtml: string; audience?: "guest" | "staff" }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phuket Rafting</title>
</head>
<body style="margin:0; padding:0; background:#f6f7f4; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f4; padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e9ebe6;">
<tr>
<td style="background:#16191b; padding:22px 28px;">
<span style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; font-weight:800; letter-spacing:0.5px; color:#ffffff;">PHUKET</span>
<span style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; font-weight:800; letter-spacing:0.5px; color:#e8590c;"> RAFTING</span>
</td>
</tr>
<tr>
<td style="padding:32px 28px; font-size:15px; line-height:1.6; color:#16191b;">
${opts.bodyHtml}
</td>
</tr>
<tr>
<td style="padding:20px 28px; background:#f6f7f4; border-top:1px solid #e9ebe6; font-size:12px; line-height:1.6; color:#79838a;">
<p style="margin:0 0 4px;"><strong style="color:#515b62;">${escapeHtml(BUSINESS_NAME)}</strong></p>
<p style="margin:0 0 4px;">Le Rafting, Phang Nga, Thailand &middot; <a href="tel:${escapeHtml(BUSINESS_PHONE)}" style="color:#79838a; text-decoration:underline;">${escapeHtml(BUSINESS_PHONE)}</a></p>
${opts.audience === "staff" ? "" : `<p style="margin:0;">You're receiving this because you contacted us or made a booking with ${escapeHtml(BUSINESS_NAME)}.</p>`}
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A labelled key/value block for booking details -- reused by every guest-facing booking email so the layout is identical regardless of which one fired. */
function emailDetailCard(rows: [label: string, value: string][]): string {
  const cells = rows
    .map(
      ([label, value]) => `<tr>
<td style="padding:6px 0; font-size:13px; color:#79838a; white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:6px 0 6px 16px; font-size:14px; color:#16191b; font-weight:600;">${value}</td>
</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f4; border-radius:8px; padding:16px 18px; margin:16px 0;">${cells}</table>`;
}

/** A pill-style button, styled like the site's .pr-btn-accent -- used for the one primary call to action a booking email offers (manage/view link). */
function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr><td style="border-radius:999px; background:#e8590c;"><a href="${escapeHtml(href)}" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">${escapeHtml(label)}</a></td></tr></table>`;
}

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
export async function sendEnquiryNotification(enquiry: EnquiryNotification, config?: BrevoConfig): Promise<void> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const notifyEmail = env.BREVO_NOTIFY_EMAIL;

  if (!apiKey || !senderEmail || !notifyEmail) {
    return;
  }

  const bodyHtml = `
    <p style="margin:0 0 8px; font-size:17px; font-weight:700;">New enquiry from the website</p>
    ${emailDetailCard([
      ["Name", escapeHtml(enquiry.name)],
      ["Email", escapeHtml(enquiry.email)],
      ["Phone", escapeHtml(enquiry.phone || "--")],
      ["Locale", escapeHtml(enquiry.locale)],
    ])}
    <p style="margin:16px 0 4px; font-size:13px; color:#79838a;">Message</p>
    <p style="margin:0; white-space:pre-wrap;">${escapeHtml(enquiry.message)}</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting Website",
    to: [{ email: notifyEmail }],
    replyTo: { email: enquiry.email, name: enquiry.name },
    subject: `New enquiry from ${enquiry.name}`,
    html: renderEmailLayout({ preheader: `${enquiry.name}: ${enquiry.message.slice(0, 100)}`, bodyHtml, audience: "staff" }),
  });
}

/**
 * Sent TO the guest the moment they submit "Send us a message" -- the missing
 * half of the enquiry flow. sendEnquiryNotification above tells the business
 * a lead came in; until this existed, the guest side of that same exchange
 * got nothing but the on-page "Thanks!" text, which vanishes the moment they
 * close the tab. Nothing here promises a reply time beyond what the guest
 * was already told on the page, so there's no commitment this can break.
 *
 * Fail-open, same as sendEnquiryNotification and for the identical reason:
 * the enquiries row is already durably in D1 by the time this is called, so
 * a Brevo outage must degrade to "the guest doesn't get a receipt email",
 * never to "the enquiry looks like it failed".
 */
export async function sendEnquiryAckEmail(enquiry: EnquiryNotification, config?: BrevoConfig): Promise<void> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return;

  const bodyHtml = `
    <p>Hi ${escapeHtml(enquiry.name)},</p>
    <p>Thanks for reaching out -- we've got your message and someone from our team will reply shortly.</p>
    <p style="margin:16px 0 4px; font-size:13px; color:#79838a;">What you sent us</p>
    <p style="margin:0; white-space:pre-wrap; color:#515b62;">${escapeHtml(enquiry.message)}</p>
    <p style="margin-top:20px;">Need us sooner? Message us on WhatsApp and we'll pick it up directly.</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting",
    to: [{ email: enquiry.email, name: enquiry.name }],
    subject: "We've got your message",
    html: renderEmailLayout({ preheader: "Thanks for reaching out -- we'll reply shortly.", bodyHtml }),
  });
}

export interface BookingReceivedEmail {
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
 * "Booking Received" -- says Received, never Confirmed (plan §2). Two
 * callers: automatically the moment a booking is created (lib/booking-ack.ts,
 * both tour and camp paths) and again whenever staff click "Notify guest" on
 * the booking detail page (dashboard/bookings/actions.ts's notifyGuestEmail)
 * -- the button re-sends the same receipt, it doesn't change what it says.
 * Neither caller lets this assert a confirmation; that's sendBookingStatusEmail's
 * job, fired only when staff actually move the booking to Confirmed.
 *
 * NOT fail-open at this layer -- throws on a real send failure so each
 * caller can record its own outcome (booking-ack.ts's booking_ack_email log,
 * notifyGuestEmail's last_email_status) rather than a silently-swallowed
 * failure looking like a successful send.
 *
 * No-ops if BREVO_API_KEY/BREVO_SENDER_EMAIL aren't configured -- same
 * "let the rest of the flow work before business addresses exist" reasoning
 * as sendEnquiryNotification -- but unlike that fire-and-forget background
 * effect, this one's callers need to tell a no-op apart from a real send:
 * returns false for "not configured, nothing was sent" vs true for "Brevo
 * actually accepted it". (Confirmed live: before this return value existed,
 * a misconfigured Brevo made every send look like a genuine success in the
 * dashboard/audit log.)
 */
export async function sendBookingReceivedEmail(booking: BookingReceivedEmail, config?: BrevoConfig): Promise<boolean> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    return false;
  }

  const bodyHtml = `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p>We've received your booking request -- <strong>this confirms we have it, not that it's fully confirmed yet</strong>.
       Our team will be in touch with pickup details shortly.</p>
    ${emailDetailCard([
      ["Booking", escapeHtml(booking.productName)],
      ["Date", escapeHtml(booking.date)],
      ["Total", `${baht(booking.total)}`],
    ])}
    ${booking.manageUrl ? emailButton(booking.manageUrl, "View or manage your booking") : ""}
    <p style="margin-top:20px;">Questions? Just reply to this email or message us on WhatsApp.</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting",
    to: [{ email: booking.guestEmail, name: booking.guestName }],
    subject: `Booking received -- ${booking.productName}`,
    html: renderEmailLayout({ preheader: `We've got your request for ${booking.productName} -- next, our team confirms it.`, bodyHtml }),
  });
  return true;
}

/**
 * Guest-facing "Confirmed" / "Cancelled" email, fired only when staff
 * actually change a booking's status to one of those two (dashboard/bookings
 * /actions.ts's changeBookingStatus) -- never automatically, never from a
 * guest action. That's the load-bearing distinction plan §2 draws between
 * this and sendBookingReceivedEmail: Received is a receipt for something the
 * guest just did, this is the business asserting something is actually true,
 * so nothing sends it except the human decision it describes.
 *
 * Same not-fail-open contract as sendBookingReceivedEmail and for the same
 * reason -- the caller records last_email_status, so a swallowed failure
 * would misreport as a successful send.
 *
 * The cancelled copy deliberately does not state a refund amount or
 * eligibility: refunds are a separate staff action (refundBooking) that may
 * or may not follow a cancellation, and asserting one here could promise
 * money that was never actually returned.
 */
export async function sendBookingStatusEmail(
  booking: BookingReceivedEmail,
  status: "confirmed" | "cancelled",
  config?: BrevoConfig
): Promise<boolean> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return false;

  const detailCard = emailDetailCard([
    ["Booking", escapeHtml(booking.productName)],
    ["Date", escapeHtml(booking.date)],
    ["Total", `${baht(booking.total)}`],
  ]);

  const bodyHtml =
    status === "confirmed"
      ? `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p><strong style="color:#0a7d4d;">Your booking is confirmed.</strong> We'll see you on the day -- pickup details
       will follow separately if you booked a transfer.</p>
    ${detailCard}
    ${booking.manageUrl ? emailButton(booking.manageUrl, "View your booking") : ""}
    <p style="margin-top:20px;">Questions before then? Just reply to this email or message us on WhatsApp.</p>
  `
      : `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p><strong style="color:#c2410c;">This booking has been cancelled.</strong></p>
    ${detailCard}
    <p>If a payment is due back to you, our team will follow up separately about the refund, per our cancellation
       policy. If this wasn't you or you think it's a mistake, reply to this email right away.</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting",
    to: [{ email: booking.guestEmail, name: booking.guestName }],
    subject: status === "confirmed" ? `Booking confirmed -- ${booking.productName}` : `Booking cancelled -- ${booking.productName}`,
    html: renderEmailLayout({
      preheader:
        status === "confirmed"
          ? `You're confirmed for ${booking.productName} on ${booking.date}.`
          : `Your booking for ${booking.productName} has been cancelled.`,
      bodyHtml,
    }),
  });
  return true;
}

/**
 * Short internal copy to the business inbox whenever a booking is created or
 * its status moves to Confirmed/Cancelled -- the "stakeholders" side of those
 * three events, mirroring sendEnquiryNotification's guest/business split for
 * enquiries. Before this existed, a new booking was invisible to staff unless
 * someone happened to open the dashboard; this makes it land in the same
 * inbox the enquiry notifications already do.
 *
 * Deliberately terse (no full detail card) -- this is a heads-up with a link
 * into the dashboard, not the record of truth. The booking row and
 * booking_logs are that; this just makes sure a human notices promptly.
 *
 * Fail-open, same as sendEnquiryNotification: never lets an internal FYI
 * email block or complicate a booking flow or a staff status change that has
 * already succeeded.
 */
export async function sendBookingStaffNotice(
  booking: { id: string; guestName: string; productName: string; date: string; total: number; currency: string },
  event: "new" | "confirmed" | "cancelled",
  config?: BrevoConfig
): Promise<void> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const notifyEmail = env.BREVO_NOTIFY_EMAIL;
  if (!apiKey || !senderEmail || !notifyEmail) return;

  const label = event === "new" ? "New booking" : event === "confirmed" ? "Booking confirmed" : "Booking cancelled";
  const bodyHtml = `
    <p style="margin:0 0 8px; font-size:17px; font-weight:700;">${label}</p>
    ${emailDetailCard([
      ["Guest", escapeHtml(booking.guestName)],
      ["Booking", escapeHtml(booking.productName)],
      ["Date", escapeHtml(booking.date)],
      ["Total", `${baht(booking.total)}`],
    ])}
    <p style="margin:16px 0 0; font-size:13px; color:#79838a;">Booking ref: ${escapeHtml(booking.id)}</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting Website",
    to: [{ email: notifyEmail }],
    subject: `${label} -- ${booking.guestName} (${booking.productName})`,
    html: renderEmailLayout({ preheader: `${booking.guestName} -- ${booking.productName}, ${booking.date}`, bodyHtml, audience: "staff" }),
  });
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
export async function sendManageRequestNotification(req: ManageRequestNotification, config?: BrevoConfig): Promise<void> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  const notifyEmail = env.BREVO_NOTIFY_EMAIL;

  if (!apiKey || !senderEmail || !notifyEmail) {
    return;
  }

  const label = req.requestType === "cancel" ? "Cancellation" : "Reschedule";
  const bodyHtml = `
    <p style="margin:0 0 8px; font-size:17px; font-weight:700;">${label} request from a guest</p>
    ${emailDetailCard([
      ["Booking", `${escapeHtml(req.productName)} (#${escapeHtml(req.bookingId)})`],
      ["Guest", escapeHtml(req.guestName)],
    ])}
    ${req.message ? `<p style="margin:16px 0 4px; font-size:13px; color:#79838a;">Message</p><p style="margin:0; white-space:pre-wrap;">${escapeHtml(req.message)}</p>` : ""}
    <p style="margin:16px 0 0; font-size:13px; color:#79838a;">Review in the dashboard: /dashboard/bookings/${escapeHtml(req.bookingId)}</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting Website",
    to: [{ email: notifyEmail }],
    subject: `${label} request -- ${req.guestName} (${req.productName})`,
    html: renderEmailLayout({ preheader: `${req.guestName} asked to ${req.requestType} ${req.productName}`, bodyHtml, audience: "staff" }),
  });
}

interface ScheduledGuestEmail {
  guestName: string;
  guestEmail: string;
  productName: string;
  date: string;
  startTime: string | null;
  pickupZoneName: string | null;
  pickupEarliestTime: string | null;
  hotel: string | null;
  manageUrl: string | null;
}

/**
 * T-1 pre-arrival pickup confirmation (plan §2's "T-1 day pickup-time
 * confirmation via email"), sent by the daily cron, not a staff click.
 *
 * This is a deliberate, narrow exception to plan §2's "all guest
 * notifications are explicit staff button-clicks" rule (see
 * sendBookingReceivedEmail's comment). That rule exists so nothing ever tells
 * a guest their booking is CONFIRMED without a human deciding it is -- and
 * §2 itself carves out this automation in the same breath. Nothing here
 * asserts confirmation: it restates details the guest already gave us and
 * tells them where to reach us. Keep it that way.
 *
 * Returns false (no-op) when Brevo isn't configured, throws on a real send
 * failure -- same contract as sendBookingReceivedEmail, so the caller can
 * record 'not_configured' vs 'failed' vs 'sent' rather than a misleading
 * uniform 'sent'.
 */
export async function sendPreArrivalEmail(booking: ScheduledGuestEmail, config?: BrevoConfig): Promise<boolean> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return false;

  // Pickup details are the whole point of this email, so be explicit when
  // there AREN'T any -- a guest who chose "no pickup" reading a reminder that
  // silently omits any mention of it could easily assume a van is coming.
  const pickupRows: [string, string][] = [
    [
      "Pickup",
      `${escapeHtml(booking.pickupZoneName ?? "")}${booking.pickupEarliestTime ? ` from around ${escapeHtml(booking.pickupEarliestTime)}` : ""}`,
    ],
  ];
  if (booking.hotel) pickupRows.push(["Hotel", escapeHtml(booking.hotel)]);
  const pickupBlock = booking.pickupZoneName
    ? `${emailDetailCard(pickupRows)}
       <p>Please be ready in your hotel lobby 10 minutes before that time. We'll call if there's any delay.</p>`
    : `<p><strong>No pickup booked</strong> -- you're making your own way to us. Need a transfer after all? Just reply to this email or message us on WhatsApp.</p>`;

  const bodyHtml = `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p>See you tomorrow! Here are your details for <strong>${escapeHtml(booking.productName)}</strong> on
       ${escapeHtml(booking.date)}${booking.startTime ? ` at ${escapeHtml(booking.startTime)}` : ""}.</p>
    ${pickupBlock}
    <p>Bring: swimwear, a change of clothes, sunscreen and a towel. We provide all safety gear, and there are
       hot showers and lockers at the base.</p>
    ${booking.manageUrl ? emailButton(booking.manageUrl, "View your booking or sign your waivers") : ""}
    <p style="margin-top:20px;">Any questions, just reply to this email or message us on WhatsApp.</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting",
    to: [{ email: booking.guestEmail, name: booking.guestName }],
    subject: `See you tomorrow -- ${booking.productName}`,
    html: renderEmailLayout({ preheader: `Tomorrow: ${booking.productName} on ${booking.date}. Here's what to know.`, bodyHtml }),
  });
  return true;
}

/**
 * T+1 thank-you with a review link (plan §2's "T+1 day thank-you with
 * Google-review link"). Same no-op/throw contract as above.
 *
 * GOOGLE_REVIEW_URL is still a placeholder (see lib/site.ts).
 */
export async function sendThankYouEmail(booking: ScheduledGuestEmail, config?: BrevoConfig): Promise<boolean> {
  const env = resolveBrevoConfig(config);
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) return false;

  const bodyHtml = `
    <p>Hi ${escapeHtml(booking.guestName)},</p>
    <p>Thanks for joining us for <strong>${escapeHtml(booking.productName)}</strong> -- we hope the river treated
       you well.</p>
    <p>If you enjoyed it, a quick review genuinely helps a small local operator like us:</p>
    ${emailButton(GOOGLE_REVIEW_URL, "Leave us a review")}
    <p style="margin-top:20px;">And if anything wasn't right, please reply to this email and tell us directly --
       we'd rather hear it from you than not at all.</p>
  `;

  await sendViaBrevo({
    apiKey,
    senderEmail,
    senderName: "Phuket Rafting",
    to: [{ email: booking.guestEmail, name: booking.guestName }],
    subject: `Thanks for rafting with us, ${booking.guestName}!`,
    html: renderEmailLayout({ preheader: `Thanks for joining us for ${booking.productName} -- we hope you had a great time.`, bodyHtml }),
  });
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
