"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getBookingByManageToken } from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";
import { sendManageRequestNotification } from "@/lib/brevo";

const ManageRequestSchema = z.object({
  requestType: z.enum(["cancel", "reschedule"]),
  message: z.string().trim().max(1000).optional().default(""),
});

export interface ManageRequestFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * Guest self-service cancel/reschedule REQUEST (plan §2: "creates a request
 * for staff, never auto-mutates") -- deliberately does not touch
 * bookings.status itself. Writes a booking_logs row (the same append-only
 * audit trail staff already see on the booking's Activity log,
 * dashboard/bookings/[id]/page.tsx) and fires a fail-open notification email,
 * exactly like a new enquiry -- reusing existing patterns rather than a new
 * "requests" table/UI, since staff already have a place they look.
 *
 * Same rate-limit -> Turnstile -> Zod -> mutate order as enquiry-actions.ts /
 * booking-actions.ts: this is a real, directly POST-reachable Server Action
 * regardless of how guarded the UI is, and the manage_token proves *which*
 * booking, not *not a bot* -- Turnstile still earns its place here.
 *
 * manageToken is bound by the caller (ManageBookingRequestForm) via
 * .bind(null, token) rather than read from the form body -- it's the sole
 * authorization for this write, so it must come from the same trust anchor
 * as the page itself (the URL segment), not a value the client's own
 * FormData could be made to lie about.
 */
export async function requestBookingChange(
  manageToken: string,
  _prevState: ManageRequestFormState,
  formData: FormData
): Promise<ManageRequestFormState> {
  const requestHeaders = await headers();
  const cfIp = requestHeaders.get("cf-connecting-ip");
  const ip = cfIp ?? requestHeaders.get("x-forwarded-for");

  try {
    const allowed = await checkRateLimit(`manage-request:${cfIp ?? "no-cf-ip"}`, 5, 60);
    if (!allowed) {
      return { status: "error", message: "Too many requests -- please wait a minute and try again." };
    }

    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return { status: "error", message: "We couldn't verify you're human -- please try again." };
    }

    const parsed = ManageRequestSchema.safeParse({
      requestType: formData.get("request_type"),
      message: formData.get("message") ?? "",
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
    }

    const booking = await getBookingByManageToken(manageToken);
    if (!booking) {
      return { status: "error", message: "This link isn't valid. Please use the link from your booking email, or message us on WhatsApp." };
    }
    if (booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show") {
      return { status: "error", message: "This booking can no longer be changed. Message us on WhatsApp if you need help." };
    }

    const data = parsed.data;
    await logBookingEvent(booking.id, "guest", `guest_${data.requestType}_requested`, {
      message: data.message || null,
    });

    // Fail-open -- the booking_logs row above is the durable record; a Brevo
    // outage must never turn a real guest request into a lost one.
    try {
      await sendManageRequestNotification({
        bookingId: booking.id,
        guestName: booking.guest_name,
        productName: booking.product_name ?? "booking",
        requestType: data.requestType,
        message: data.message,
      });
    } catch (err) {
      console.error("Brevo manage-request notification failed", err);
    }

    return {
      status: "success",
      message:
        data.requestType === "cancel"
          ? "Got it -- we've received your cancellation request and will confirm by email or WhatsApp shortly."
          : "Got it -- we've received your reschedule request and will confirm by email or WhatsApp shortly.",
    };
  } catch (err) {
    console.error("requestBookingChange failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
