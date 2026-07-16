"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { getPaymentPolicy, isWithinCancellationWindow } from "@/lib/queries/settings";
import { getBookingByManageToken } from "@/lib/queries/bookings";
import { replaceParticipants, type ParticipantInput } from "@/lib/queries/participants";
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
    // Snapshot the policy position AT REQUEST TIME onto the log. Staff act on
    // these hours or days later, by which point recomputing "were they inside
    // the free window?" gives a different answer than when the guest actually
    // asked -- and the guest's entitlement is fixed by when they asked, not by
    // when someone got round to it. null means we couldn't tell; staff decide.
    const policy = await getPaymentPolicy();
    const withinWindow = isWithinCancellationWindow(booking.date, policy.cancellationWindowHours);
    await logBookingEvent(booking.id, "guest", `guest_${data.requestType}_requested`, {
      message: data.message || null,
      within_free_window: withinWindow,
      window_hours: policy.cancellationWindowHours,
      deposit_amount: booking.deposit_amount,
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

export interface WaiverFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

// Bounds mirror the public BookingSchema's guestName (.min(2).max(120)) for
// the same field shape, and booking_participants' own columns for the rest.
// A participant's age drives real operator/insurance rules (plan §7), so a
// nonsense value is rejected outright rather than silently stored: 0-120 is
// the widest range that can describe a real human, not a guess at this
// operator's actual minimums (which live in tour_age_bands, not here).
const ParticipantSchema = z.object({
  name: z.string().trim().min(2, "Please enter each participant's full name.").max(120),
  // Validated as a digit string BEFORE coercion, not with a bare
  // z.coerce.number(): Number("") and Number(null) are both 0, and 0 is a
  // *legitimate* age here (an infant under 1), so a blank field -- or an
  // age_<i> omitted from the POST entirely, which makes formData.get() return
  // null -- would coerce straight to a valid-looking 0 and be stored as
  // "infant" on what is a legal/insurance record. The same coercion also
  // silently accepts "0x10" as 16 and "1e2" as 100. The seat count is read
  // from D1 rather than the form for exactly this trust-boundary reason; the
  // contents of each row deserve the same treatment.
  age: z
    .string({ error: "Please enter an age for each participant." })
    .trim()
    .regex(/^\d{1,3}$/, "Please enter a real age for each participant.")
    .transform(Number)
    .pipe(z.number().int().min(0).max(120, "Please enter a real age for each participant.")),
  healthDeclaration: z.string().trim().max(1000).optional().default(""),
  signatureText: z
    .string()
    .trim()
    .min(2, "Each participant (or their guardian) must type their name to sign.")
    .max(120),
});

/**
 * Per-participant waiver signing from the manage-booking link (plan §7: "a
 * per-participant waiver completed via the manage-booking link or on-site QR
 * before departure (each rafter's name, age, health declaration, signature)
 * -- the booker's checkbox alone doesn't cover companions").
 *
 * Deliberately does NOT touch bookings.waiver_acknowledged: that column is
 * the BOOKER's own at-booking consent checkbox (migration 0005's own comment
 * says so explicitly) -- a separate fact from whether every participant has
 * since signed. Conflating them would silently overwrite one record with the
 * other; the day-sheet shows both, side by side.
 *
 * Same rate-limit -> Turnstile -> Zod -> mutate order and same
 * token-is-the-only-authorization stance as requestBookingChange above.
 */
export async function submitWaivers(
  manageToken: string,
  lang: string,
  _prevState: WaiverFormState,
  formData: FormData
): Promise<WaiverFormState> {
  const requestHeaders = await headers();
  const cfIp = requestHeaders.get("cf-connecting-ip");
  const ip = cfIp ?? requestHeaders.get("x-forwarded-for");

  try {
    const allowed = await checkRateLimit(`waiver:${cfIp ?? "no-cf-ip"}`, 5, 60);
    if (!allowed) {
      return { status: "error", message: "Too many requests -- please wait a minute and try again." };
    }

    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return { status: "error", message: "We couldn't verify you're human -- please try again." };
    }

    const booking = await getBookingByManageToken(manageToken);
    if (!booking) {
      return { status: "error", message: "This link isn't valid. Please use the link from your booking email, or message us on WhatsApp." };
    }
    if (booking.status === "cancelled" || booking.status === "no_show") {
      return { status: "error", message: "This booking is no longer active. Message us on WhatsApp if you need help." };
    }

    // The seat count on the booking -- NOT a client-supplied row count -- is
    // what decides how many waivers this booking needs. Reading it from the
    // form would let a caller submit one waiver for a six-person booking and
    // have it look complete on the day-sheet.
    const expected = booking.adults + booking.children + booking.infants;
    const participants: ParticipantInput[] = [];
    for (let i = 0; i < expected; i++) {
      const parsed = ParticipantSchema.safeParse({
        name: formData.get(`name_${i}`),
        age: formData.get(`age_${i}`),
        healthDeclaration: formData.get(`health_${i}`) ?? "",
        signatureText: formData.get(`signature_${i}`),
      });
      if (!parsed.success) {
        return {
          status: "error",
          message: `Participant ${i + 1}: ${parsed.error.issues[0]?.message ?? "please check the details."}`,
        };
      }
      participants.push({
        name: parsed.data.name,
        age: parsed.data.age,
        healthDeclaration: parsed.data.healthDeclaration || null,
        signatureText: parsed.data.signatureText,
      });
    }

    await replaceParticipants(booking.id, participants);
    await logBookingEvent(booking.id, "guest", "waivers_signed", { count: participants.length });

    // Without this the page's "N of M waivers signed" line (a server-rendered
    // count read from D1) keeps showing the pre-submit number even though the
    // action just succeeded -- the guest sees "0 of 2 signed" directly above
    // "Thank you -- 2 waivers signed and on file." Unlike the other public
    // forms in this app (enquiry, booking), which show only a success message
    // and no server-derived state, this page renders data the action itself
    // just changed, so it has to be re-rendered. `lang` is validated rather
    // than trusted: it reaches revalidatePath as a path segment, and it comes
    // from a .bind() arg, so it gets the same treatment as any other
    // client-reachable input.
    const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    revalidatePath(`/${locale}/manage/${manageToken}`);

    return { status: "success", message: `Thank you -- ${participants.length} waiver${participants.length === 1 ? "" : "s"} signed and on file.` };
  } catch (err) {
    console.error("submitWaivers failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
