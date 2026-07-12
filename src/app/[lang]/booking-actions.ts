"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { createTourBooking } from "@/lib/booking";
import { calculateTourPrice, type PriceBreakdown } from "@/lib/pricing";
import { listAvailableTourSessions, type AvailableTourSession } from "@/lib/scheduling";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";

// Scope note: tour bookings only. Camp bookings need a "list available
// units for a date range" query that doesn't exist yet (scheduling.ts only
// has isCampUnitAvailable for one already-chosen unit) -- a public camp
// booking widget is a separate future chunk once that exists.

/**
 * Read-only price preview -- no capacity claim, no D1 write, so unlike
 * submitTourBooking this doesn't need Turnstile: the worst a bot gains by
 * skipping that is a cheap D1 read, not consumed inventory or a spent
 * siteverify call. It DOES still need a rate limit, though -- much lighter
 * than submitTourBooking's, but not zero. Two reasons neither is "cheap D1
 * reads only":
 *   1. This is a real Server Action endpoint (POST + action ID), reachable
 *      directly over HTTP by anything that can replay the request -- it
 *      does not go through whatever per-keystroke pacing a future UI adds.
 *      Next.js's own docs are explicit that every Server Action is an
 *      untrusted, directly-reachable entry point regardless of how the
 *      client happens to call it.
 *   2. calculateTourPrice's optional promoCode branch makes this an oracle:
 *      an invalid code returns promoApplied: null (price unchanged); a
 *      valid one returns promoApplied with the real discount amount (price
 *      visibly drops). Verified locally -- a guessed code returns
 *      `promoApplied: null`, the real code returns
 *      `promoApplied: {code, discountAmount}` and a lower `total`. Unlike
 *      submitTourBooking, guessing here costs no Turnstile solve and hits no
 *      5-per-60s cap, so an unlimited previewTourPrice is a free way to
 *      brute-force promo codes (which may be single-use, agent-specific, or
 *      capped) -- a real business-logic risk, not just "a bot wastes reads."
 * Rate limit here is deliberately far looser than submitTourBooking's
 * 5/60s -- this is meant to be called on every keystroke/param change from a
 * live-typing UI, and should never visibly throttle a real guest tuning
 * their party size or date.
 */
export async function previewTourPrice(input: {
  tourId: string;
  date: string;
  adults: number;
  children: number;
  infants: number;
  pickupZoneId: string | null;
  promoCode: string | null;
}): Promise<PriceBreakdown | { error: string }> {
  try {
    const requestHeaders = await headers();
    const cfIp = requestHeaders.get("cf-connecting-ip");
    const allowed = await checkRateLimit(`preview-price:${cfIp ?? "no-cf-ip"}`, 30, 10);
    if (!allowed) {
      return { error: "Too many requests -- please slow down." };
    }

    const today = new Date().toISOString().slice(0, 10);
    return await calculateTourPrice({ ...input, bookingDate: today });
  } catch (err) {
    // calculateTourPrice throws on a genuinely broken tour/rate config
    // (pricing.ts's own guards) -- that's a real "can't price this" state
    // the caller needs to know about, not something to paper over here.
    console.error("previewTourPrice failed", err);
    return { error: err instanceof Error ? err.message : "Unable to calculate price" };
  }
}

/**
 * Sessions with open seats for one tour in a date range -- feeds the
 * widget's date picker. Unlike previewTourPrice, deliberately left
 * unrate-limited: it's one indexed, parameterized SELECT (no promo/rate
 * lookups, no oracle-able branch -- a malformed or out-of-range date just
 * returns fewer/no rows, not a different code path), and is expected to be
 * called once per tour/date-range pick rather than per keystroke. If this
 * function ever grows a conditional branch the way previewTourPrice's
 * promoCode did, revisit this.
 */
export async function getTourAvailability(tourId: string, fromDate: string, toDate: string): Promise<AvailableTourSession[]> {
  return listAvailableTourSessions(tourId, fromDate, toDate);
}

export interface BookingFormState {
  status: "idle" | "success" | "error";
  message?: string;
  bookingId?: string;
}

const BookingSchema = z.object({
  tourSessionId: z.string().trim().min(1, "Please choose a date."),
  tourId: z.string().trim().min(1),
  adults: z.coerce.number().int().min(0).max(20),
  children: z.coerce.number().int().min(0).max(20),
  infants: z.coerce.number().int().min(0).max(20),
  guestName: z.string().trim().min(2, "Please enter your name.").max(120),
  guestEmail: z.string().trim().email("Please enter a valid email address.").optional().or(z.literal("")),
  guestPhone: z.string().trim().max(40).optional().default(""),
  pickupZoneId: z.string().trim().optional().or(z.literal("")),
  hotel: z.string().trim().max(200).optional().default(""),
  addonChoice: z.string().trim().max(60).optional().default(""),
  promoCode: z.string().trim().max(40).optional().default(""),
  locale: z.string(),
  consentMarketing: z.boolean(),
});

// Order matches enquiry-actions.ts's established rate-limit -> Turnstile ->
// Zod -> mutate sequence (see that file's comment for why that order).
export async function submitTourBooking(_prevState: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const requestHeaders = await headers();
  const cfIp = requestHeaders.get("cf-connecting-ip");
  const ip = cfIp ?? requestHeaders.get("x-forwarded-for");

  try {
    const allowed = await checkRateLimit(`booking:${cfIp ?? "no-cf-ip"}`, 5, 60);
    if (!allowed) {
      return { status: "error", message: "Too many requests -- please wait a minute and try again." };
    }

    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return { status: "error", message: "We couldn't verify you're human -- please try again." };
    }

    const parsed = BookingSchema.safeParse({
      tourSessionId: formData.get("tour_session_id"),
      tourId: formData.get("tour_id"),
      adults: formData.get("adults"),
      // Read from "children_count", not "children" -- see BookingWidget.tsx's
      // comment on its hidden input: a field literally named "children"
      // shadows the DOM's inherited Element.children property on the <form>
      // element (form.children returns this input instead of the real
      // HTMLCollection). FormData itself isn't affected, but the field is
      // named children_count here to keep the wire name matching the widget.
      children: formData.get("children_count"),
      infants: formData.get("infants"),
      guestName: formData.get("guest_name"),
      // FormData.get() returns null (not undefined) for a key that's
      // entirely absent -- e.g. an optional field the widget didn't render
      // this time (no promo-code box open, no pickup zone chosen). Zod's
      // .optional() only accepts undefined, and .literal("") only matches
      // "", so a raw null here would fail validation for a field that's
      // legitimately unset, not malformed. `?? ""` normalizes "absent" and
      // "present but blank" to the same value these schemas already handle.
      guestEmail: formData.get("guest_email") ?? "",
      guestPhone: formData.get("guest_phone") ?? "",
      pickupZoneId: formData.get("pickup_zone_id") ?? "",
      hotel: formData.get("hotel") ?? "",
      addonChoice: formData.get("addon_choice") ?? "",
      promoCode: formData.get("promo_code") ?? "",
      locale: formData.get("locale"),
      consentMarketing: formData.get("consent_marketing") === "on",
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
    }
    const data = parsed.data;
    if (data.adults + data.children + data.infants <= 0) {
      return { status: "error", message: "Please select at least one guest." };
    }
    const locale = isSupportedLocale(data.locale) ? data.locale : DEFAULT_LOCALE;

    const result = await createTourBooking({
      tourSessionId: data.tourSessionId,
      tourId: data.tourId,
      adults: data.adults,
      children: data.children,
      infants: data.infants,
      guestName: data.guestName,
      guestEmail: data.guestEmail || null,
      guestPhone: data.guestPhone || null,
      pickupZoneId: data.pickupZoneId || null,
      hotel: data.hotel || null,
      addonChoice: data.addonChoice || null,
      promoCode: data.promoCode || null,
      locale,
      source: "web",
      bookedByAgentId: null,
      consentMarketing: data.consentMarketing,
    });

    if (!result.success) {
      const messages: Record<string, string> = {
        not_found: "That date is no longer available -- please pick another.",
        no_capacity: "Sorry, that date just sold out -- please pick another.",
        blocked: "That date isn't available -- please pick another.",
        invalid_input: "Please check your details and try again.",
      };
      return { status: "error", message: messages[result.reason ?? ""] ?? "Something went wrong -- please try WhatsApp instead." };
    }

    return { status: "success", message: "Booked! We'll confirm your pickup details shortly.", bookingId: result.bookingId };
  } catch (err) {
    console.error("submitTourBooking failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
