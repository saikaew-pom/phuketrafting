"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { createCampBooking } from "@/lib/booking";
import { openCheckoutForBooking } from "@/lib/checkout";
import { sendBookingAck } from "@/lib/booking-ack";
import { calculateCampPrice, MAX_STAY_NIGHTS, type PriceBreakdown } from "@/lib/pricing";
import { listAvailableCampUnits, type AvailableCampUnit } from "@/lib/scheduling";
import { getCampRates, type CampRate } from "@/lib/queries/camping";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { bangkokTodayISO } from "@/lib/format";

// Same shape as booking-actions.ts's tour-booking trio (previewTourPrice /
// getTourAvailability / submitTourBooking) -- see that file's comments for
// the full reasoning behind each function's rate-limit (or deliberate lack
// of one). Not repeated here except where the camp path actually differs.

/** Same oracle/entry-point reasoning as previewTourPrice -- see that file. */
export async function previewCampPrice(input: {
  zoneId: string;
  stayType: string;
  checkIn: string;
  checkOut: string;
  promoCode: string | null;
  addonIds?: string[];
}): Promise<PriceBreakdown | { error: string }> {
  try {
    const requestHeaders = await headers();
    const cfIp = requestHeaders.get("cf-connecting-ip");
    const allowed = await checkRateLimit(`preview-price:${cfIp ?? "no-cf-ip"}`, 30, 10);
    if (!allowed) {
      return { error: "Too many requests -- please slow down." };
    }

    return await calculateCampPrice({ ...input, bookingDate: bangkokTodayISO() });
  } catch (err) {
    // Generic message -- calculateCampPrice's throws carry internal detail
    // (rate/zone ids) that shouldn't reach an unauthenticated caller. (A21.)
    console.error("previewCampPrice failed", err);
    return { error: "We couldn't calculate that price -- please adjust your dates or contact us." };
  }
}

/**
 * True (allowed) unless the caller is over the loose read limit. Every export of
 * this "use server" file is a directly-POST-reachable endpoint; unlike the tour
 * availability read (one plain indexed SELECT, deliberately open), the camp
 * reads run a correlated NOT EXISTS per unit / a rates scan, so they get the
 * same loose per-IP limit the price preview uses so they can't be hammered for
 * free. (Audit A20.)
 */
async function campReadAllowed(): Promise<boolean> {
  const cfIp = (await headers()).get("cf-connecting-ip");
  return checkRateLimit(`camp-read:${cfIp ?? "no-cf-ip"}`, 30, 10);
}

/** Camp units with no overlapping booking for one zone/date-range -- feeds the widget's unit picker. */
export async function getCampAvailability(zoneId: string, checkIn: string, checkOut: string): Promise<AvailableCampUnit[]> {
  if (!(await campReadAllowed())) return [];
  return listAvailableCampUnits(zoneId, checkIn, checkOut);
}

/** Active stay-type rates for one zone -- feeds the widget's stay-type picker. */
export async function getCampZoneRates(zoneId: string): Promise<CampRate[]> {
  if (!(await campReadAllowed())) return [];
  const rates = await getCampRates(zoneId);
  return rates.filter((r) => r.is_active);
}

export interface CampBookingFormState {
  status: "idle" | "success" | "error";
  message?: string;
  bookingId?: string;
  manageToken?: string;
  /** See BookingFormState.checkoutUrl -- same contract. */
  checkoutUrl?: string;
}

const CampBookingSchema = z.object({
  zoneId: z.string().trim().min(1),
  campUnitId: z.string().trim().min(1, "Please choose a campsite."),
  stayType: z.string().trim().min(1),
  // .max(10): a valid date is exactly "YYYY-MM-DD" (10 chars). Bounding the
  // string is the cheapest backstop against a hostile far-future checkOut that
  // would drive the day-by-day price loop for millions of iterations; the
  // nights cap in submitCampBooking is the friendly, business-rule version.
  // (Audit A2.)
  checkIn: z.string().trim().min(1, "Please choose a check-in date.").max(10),
  checkOut: z.string().trim().min(1, "Please choose a check-out date.").max(10),
  adults: z.coerce.number().int().min(0).max(20),
  children: z.coerce.number().int().min(0).max(20),
  infants: z.coerce.number().int().min(0).max(20),
  guestName: z.string().trim().min(2, "Please enter your name.").max(120),
  guestEmail: z.string().trim().email("Please enter a valid email address.").optional().or(z.literal("")),
  guestPhone: z.string().trim().max(40).optional().default(""),
  // Priced add-ons the guest ticked -- ids only; price/name resolved from D1 in
  // createCampBooking. Capped like the tour path. (Migration 0018.)
  addonIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  promoCode: z.string().trim().max(40).optional().default(""),
  locale: z.string(),
  consentMarketing: z.boolean(),
});

// Same rate-limit -> Turnstile -> Zod -> mutate order as submitTourBooking.
export async function submitCampBooking(
  _prevState: CampBookingFormState,
  formData: FormData
): Promise<CampBookingFormState> {
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

    const parsed = CampBookingSchema.safeParse({
      zoneId: formData.get("zone_id"),
      campUnitId: formData.get("camp_unit_id"),
      stayType: formData.get("stay_type"),
      checkIn: formData.get("check_in"),
      checkOut: formData.get("check_out"),
      adults: formData.get("adults"),
      // Same DOM-clobbering reasoning as booking-actions.ts's "children_count".
      children: formData.get("children_count"),
      infants: formData.get("infants"),
      guestName: formData.get("guest_name"),
      guestEmail: formData.get("guest_email") ?? "",
      guestPhone: formData.get("guest_phone") ?? "",
      addonIds: formData.getAll("addon_ids").map(String),
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
    // Same post-parse business-rule-check pattern as the guest-count check
    // above (not a Zod .refine -- these need the two fields compared against
    // each other and against "today", which Zod's per-field schema doesn't
    // see). The widget's <input type="date" min={...}> only advises the
    // browser's native date picker; nothing stops a direct POST to this
    // Server Action (an untrusted, directly-reachable entry point per this
    // file's other comments) from sending an equal/inverted range or a
    // check-in in the past. Without this, createCampBooking would only catch
    // checkOut<=checkIn (via calculateCampPrice's own guard, which throws and
    // is caught by this function's outer try/catch as a generic "Something
    // went wrong" -- correct outcome, unhelpful message) and would NOT catch
    // a past check-in at all: calculateCampPrice never compares checkIn
    // against today, so a booking for, say, 2020-01-01 is priced and
    // persisted successfully (confirmed live). A stray past-dated booking
    // pollutes the manifest guests actually see staff act on, so reject it
    // here with a specific message rather than let it either fail generically
    // or silently succeed.
    // Bangkok, not UTC: a bare toISOString() date is a day behind between
    // 00:00 and 07:00 Thailand time, which would reject a legitimate same-day
    // check-in during those hours. (Audit A7.)
    const today = bangkokTodayISO();
    if (data.checkIn < today) {
      return { status: "error", message: "Please choose a check-in date that hasn't passed." };
    }
    if (data.checkOut <= data.checkIn) {
      return { status: "error", message: "Check-out must be after check-in." };
    }
    // Friendly form of the MAX_STAY_NIGHTS cap (the calculator throws a raw
    // message the outer catch would turn into a generic error). (Audit A2.)
    const nights = Math.round(
      (new Date(`${data.checkOut}T00:00:00Z`).getTime() - new Date(`${data.checkIn}T00:00:00Z`).getTime()) / 86_400_000
    );
    if (nights > MAX_STAY_NIGHTS) {
      return { status: "error", message: `Stays are up to ${MAX_STAY_NIGHTS} nights -- please shorten your dates or contact us for a longer booking.` };
    }
    const locale = isSupportedLocale(data.locale) ? data.locale : DEFAULT_LOCALE;

    const result = await createCampBooking({
      campUnitId: data.campUnitId,
      zoneId: data.zoneId,
      stayType: data.stayType,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      adults: data.adults,
      children: data.children,
      infants: data.infants,
      guestName: data.guestName,
      guestEmail: data.guestEmail || null,
      guestPhone: data.guestPhone || null,
      addonIds: data.addonIds,
      promoCode: data.promoCode || null,
      locale,
      source: "web",
      bookedByAgentId: null,
      consentMarketing: data.consentMarketing,
    });

    if (!result.success) {
      const messages: Record<string, string> = {
        not_found: "That campsite is no longer available -- please pick another.",
        no_capacity: "Sorry, that campsite just got booked -- please pick another.",
        blocked: "That campsite isn't available -- please pick another.",
        invalid_input: "Please check your details and try again.",
      };
      return { status: "error", message: messages[result.reason ?? ""] ?? "Something went wrong -- please try WhatsApp instead." };
    }

    // Same acknowledgement the tour flow sends -- a camp guest who books and
    // hears nothing is the same bug. Awaited (never fire-and-forget) because
    // the Worker can be torn down as soon as this returns; sendBookingAck
    // never throws, so a mail failure can't fail the booking.
    await sendBookingAck(result.bookingId!, requestHeaders.get("host"));

    return {
      status: "success",
      message: "Booked! We'll confirm your pickup details shortly.",
      bookingId: result.bookingId,
      manageToken: result.manageToken,
      checkoutUrl: await openCheckoutForBooking(result),
    };
  } catch (err) {
    console.error("submitCampBooking failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
