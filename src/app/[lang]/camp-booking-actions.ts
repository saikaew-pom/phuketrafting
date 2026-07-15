"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { createCampBooking } from "@/lib/booking";
import { calculateCampPrice, type PriceBreakdown } from "@/lib/pricing";
import { listAvailableCampUnits, type AvailableCampUnit } from "@/lib/scheduling";
import { getCampRates, type CampRate } from "@/lib/queries/camping";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";

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
}): Promise<PriceBreakdown | { error: string }> {
  try {
    const requestHeaders = await headers();
    const cfIp = requestHeaders.get("cf-connecting-ip");
    const allowed = await checkRateLimit(`preview-price:${cfIp ?? "no-cf-ip"}`, 30, 10);
    if (!allowed) {
      return { error: "Too many requests -- please slow down." };
    }

    const today = new Date().toISOString().slice(0, 10);
    return await calculateCampPrice({ ...input, bookingDate: today });
  } catch (err) {
    console.error("previewCampPrice failed", err);
    return { error: err instanceof Error ? err.message : "Unable to calculate price" };
  }
}

/** Camp units with no overlapping booking for one zone/date-range -- feeds the widget's unit picker. */
export async function getCampAvailability(zoneId: string, checkIn: string, checkOut: string): Promise<AvailableCampUnit[]> {
  return listAvailableCampUnits(zoneId, checkIn, checkOut);
}

/** Active stay-type rates for one zone -- feeds the widget's stay-type picker. */
export async function getCampZoneRates(zoneId: string): Promise<CampRate[]> {
  const rates = await getCampRates(zoneId);
  return rates.filter((r) => r.is_active);
}

export interface CampBookingFormState {
  status: "idle" | "success" | "error";
  message?: string;
  bookingId?: string;
  manageToken?: string;
}

const CampBookingSchema = z.object({
  zoneId: z.string().trim().min(1),
  campUnitId: z.string().trim().min(1, "Please choose a campsite."),
  stayType: z.string().trim().min(1),
  checkIn: z.string().trim().min(1, "Please choose a check-in date."),
  checkOut: z.string().trim().min(1, "Please choose a check-out date."),
  adults: z.coerce.number().int().min(0).max(20),
  children: z.coerce.number().int().min(0).max(20),
  infants: z.coerce.number().int().min(0).max(20),
  guestName: z.string().trim().min(2, "Please enter your name.").max(120),
  guestEmail: z.string().trim().email("Please enter a valid email address.").optional().or(z.literal("")),
  guestPhone: z.string().trim().max(40).optional().default(""),
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
    const today = new Date().toISOString().slice(0, 10);
    if (data.checkIn < today) {
      return { status: "error", message: "Please choose a check-in date that hasn't passed." };
    }
    if (data.checkOut <= data.checkIn) {
      return { status: "error", message: "Check-out must be after check-in." };
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

    return {
      status: "success",
      message: "Booked! We'll confirm your pickup details shortly.",
      bookingId: result.bookingId,
      manageToken: result.manageToken,
    };
  } catch (err) {
    console.error("submitCampBooking failed", err);
    return { status: "error", message: "Something went wrong -- please try WhatsApp instead." };
  }
}
