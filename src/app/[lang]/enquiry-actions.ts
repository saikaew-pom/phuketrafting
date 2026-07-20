"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { insertEnquiry } from "@/lib/queries/enquiries";
import { recordConsent } from "@/lib/queries/consent";
import { sendEnquiryNotification, sendEnquiryAckEmail } from "@/lib/brevo";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";

const EnquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().max(254, "That email address is too long.").email("Please enter a valid email address."),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().min(10, "Please tell us a bit more (10 characters minimum).").max(2000),
  locale: z.string(),
  consentMarketing: z.boolean(),
});

export interface EnquiryFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

// Order matters -- plan §3 specifies rate-limit -> Turnstile -> Zod -> insert
// -> Brevo (fail-open). Rate-limit runs first since it's the cheapest check
// and shouldn't spend a Turnstile siteverify call on an already-throttled IP.
export async function submitEnquiry(_prevState: EnquiryFormState, formData: FormData): Promise<EnquiryFormState> {
  const requestHeaders = await headers();
  // cf-connecting-ip is set by Cloudflare's edge and cannot be spoofed by
  // the client; x-forwarded-for can. The rate-limit bucket is a real
  // security boundary, so it uses cf-connecting-ip only -- if that's ever
  // absent (shouldn't happen on this stack), every such request shares one
  // conservative "no-cf-ip" bucket rather than trusting a forgeable header.
  // Turnstile's remoteip and the PDPA consent audit trail are lower-stakes
  // (a hint and a log field, not an access-control decision), so they keep
  // the existing x-forwarded-for fallback already used by consent-actions.ts.
  const cfIp = requestHeaders.get("cf-connecting-ip");
  const ip = cfIp ?? requestHeaders.get("x-forwarded-for");

  try {
    const allowed = await checkRateLimit(`enquiry:${cfIp ?? "no-cf-ip"}`, 3, 60);
    if (!allowed) {
      return { status: "error", message: "Too many requests -- please wait a minute and try again." };
    }

    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return { status: "error", message: "We couldn't verify you're human -- please try again." };
    }

    const parsed = EnquirySchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      message: formData.get("message"),
      locale: formData.get("locale"),
      consentMarketing: formData.get("consent_marketing") === "on",
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
    }
    const data = parsed.data;
    const locale = isSupportedLocale(data.locale) ? data.locale : DEFAULT_LOCALE;

    await insertEnquiry({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      locale,
      consentMarketing: data.consentMarketing,
    });

    // Same PDPA "demonstrable, timestamped consent" pattern as the cookie
    // banner (consent-actions.ts) -- the enquiries.consent_marketing flag is
    // the working copy, this is the audit trail.
    await recordConsent({
      consentType: "marketing",
      granted: data.consentMarketing,
      subjectEmail: data.email,
      ipAddress: ip,
      userAgent: requestHeaders.get("user-agent"),
    });

    // Fail-open, and independently so: the D1 insert above is the durable
    // record of the enquiry, so a Brevo outage on EITHER send must never turn
    // a real lead into a user-facing error -- and a failure on one side (e.g.
    // a typo'd guest email bouncing) must not suppress the other, since staff
    // still need their notification even if the guest's ack didn't land.
    try {
      await sendEnquiryNotification({ name: data.name, email: data.email, phone: data.phone, message: data.message, locale });
    } catch (err) {
      console.error("Brevo enquiry notification failed", err);
    }
    try {
      await sendEnquiryAckEmail({ name: data.name, email: data.email, phone: data.phone, message: data.message, locale });
    } catch (err) {
      console.error("Brevo enquiry ack email failed", err);
    }

    return { status: "success", message: "Thanks! We'll get back to you shortly." };
  } catch (err) {
    // A customer-facing form must never surface a raw 500 -- log for
    // diagnosis and degrade to a normal error state instead.
    console.error("submitEnquiry failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
