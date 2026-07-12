import { getDb } from "@/lib/db";

export type ConsentType = "cookies" | "marketing" | "waiver" | "whatsapp_optin";

export async function recordConsent(params: {
  consentType: ConsentType;
  granted: boolean;
  subjectEmail?: string | null;
  bookingId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO consent_records (subject_email, booking_id, consent_type, granted, ip_address, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(
      params.subjectEmail ?? null,
      params.bookingId ?? null,
      params.consentType,
      params.granted ? 1 : 0,
      params.ipAddress ?? null,
      params.userAgent ?? null
    )
    .run();
}
