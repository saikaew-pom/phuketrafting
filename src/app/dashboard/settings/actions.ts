"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import {
  writePolicies,
  writeSiteStats,
  type PaymentMode,
  type PaymentPolicy,
  type ChatPolicy,
  type SiteStats,
} from "@/lib/queries/settings";

const VALID_MODES: readonly PaymentMode[] = ["deposit", "full_prepay", "pay_on_day"];

function requiredNumber(raw: FormDataEntryValue | null, label: string): number {
  const trimmed = String(raw ?? "").trim();
  // Reject blank explicitly -- the function is *named* requiredNumber but the
  // old body didn't require: Number("") is 0 (finite, passes), so a cleared
  // field saved silently as 0. For "Daily AI budget" 0 reads as "stop
  // spending" and turns the chatbot dark; for "Free cancellation window" 0
  // wipes the free-cancel policy -- both with no error shown. The inputs also
  // carry `required` now, but a direct POST bypasses HTML validation, so this
  // is the real boundary. (Audit A5.)
  if (!trimmed) throw new Error(`${label} is required.`);
  const n = Number(trimmed);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${label}`);
  return n;
}

/**
 * Admin-gated, same as refunds (plan §3: "Settings: role-gated") -- these two
 * blobs decide how much money is taken up front and whether the AI can
 * propose bookings, which is not a front-desk decision.
 *
 * Validation here mirrors the getters' read-side clamps so what staff see
 * after save is exactly what they typed (a write the read-side would clamp
 * silently would make the form appear to ignore them).
 */
export async function saveSettings(formData: FormData): Promise<void> {
  const staff = await requireAdmin();

  const mode = String(formData.get("mode") ?? "");
  if (!VALID_MODES.includes(mode as PaymentMode)) throw new Error("Invalid payment mode");

  // Staff type a percentage (25), storage is a fraction (0.25) -- plan §3's
  // "plain-language microcopy": nobody at a front desk thinks in fractions.
  const depositPercent = requiredNumber(formData.get("deposit_percent"), "deposit percent");
  if (depositPercent <= 0 || depositPercent > 100) {
    throw new Error("Deposit must be between 1 and 100 percent.");
  }

  const holdMinutes = Math.round(requiredNumber(formData.get("hold_minutes"), "hold minutes"));
  // Same bounds getPaymentPolicy clamps reads to (Stripe's real expires_at
  // window, verified live in Phase 5) -- reject rather than clamp on write so
  // the admin learns the rule instead of silently getting a different number.
  if (holdMinutes < 30 || holdMinutes > 1439) {
    throw new Error("Hold must be between 30 minutes and 23 hours 59 minutes (Stripe's checkout limits).");
  }

  const cancellationWindowHours = Math.round(
    requiredNumber(formData.get("cancellation_window_hours"), "cancellation window")
  );
  if (cancellationWindowHours < 0 || cancellationWindowHours > 720) {
    throw new Error("Cancellation window must be between 0 and 720 hours (30 days).");
  }

  const dailyTokenCap = Math.round(requiredNumber(formData.get("daily_token_cap"), "daily token cap"));
  if (dailyTokenCap < 0) throw new Error("Daily token cap can't be negative.");

  const paymentPolicy: PaymentPolicy = {
    mode: mode as PaymentMode,
    depositRate: depositPercent / 100,
    holdMinutes,
    cancellationWindowHours,
  };
  const chatPolicy: ChatPolicy = {
    enabled: formData.get("chat_enabled") === "on",
    bookingMode: formData.get("chat_booking_mode") === "on",
    dailyTokenCap,
  };

  // The business's headline claims. Free text, not numbers: "1,200+" isn't a
  // number, and nothing here can verify a Google rating anyway -- the point is
  // that staff can correct them, not that we validate them.
  const stats: SiteStats = {
    googleRating: String(formData.get("stat_google_rating") ?? "").trim(),
    reviewCount: String(formData.get("stat_review_count") ?? "").trim(),
    travelerCount: String(formData.get("stat_traveler_count") ?? "").trim(),
    sinceYear: String(formData.get("stat_since_year") ?? "").trim(),
  };

  // One transaction: the form saves both, so both must land or neither --
  // see writePolicies on why a half-applied save is the bad case.
  await writePolicies(paymentPolicy, chatPolicy, staff.email);
  await writeSiteStats(stats, staff.email);

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
