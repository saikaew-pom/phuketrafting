"use server";

import { headers } from "next/headers";
import { recordConsent } from "@/lib/queries/consent";

// PDPA requires demonstrable consent (plan §7) -- every banner choice
// (accept AND decline) gets a timestamped row, not just the accepts.
export async function saveCookieConsent(granted: boolean) {
  const h = await headers();
  await recordConsent({
    consentType: "cookies",
    granted,
    ipAddress: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });
}
