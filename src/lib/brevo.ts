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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
