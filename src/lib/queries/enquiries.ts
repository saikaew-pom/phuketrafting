import { getDb } from "@/lib/db";

export interface NewEnquiry {
  name: string;
  email: string;
  phone: string;
  message: string;
  locale: string;
  consentMarketing: boolean;
}

export async function insertEnquiry(enquiry: NewEnquiry): Promise<string> {
  const id = crypto.randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO enquiries (id, name, email, phone, message, locale, source, consent_marketing)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'web', ?7)`
    )
    .bind(id, enquiry.name, enquiry.email, enquiry.phone || null, enquiry.message, enquiry.locale, enquiry.consentMarketing ? 1 : 0)
    .run();
  return id;
}

// -- Dashboard inbox (CMS coverage audit: contact-form submissions were
// written to D1 and readable by no one -- silently lost leads). Migration
// 0011 added `status` explicitly "for triage; a staff inbox view is later" --
// this is that view's data layer.

export type EnquiryStatus = "new" | "contacted" | "closed";

export interface EnquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  locale: string;
  source: string;
  status: EnquiryStatus;
  created_at: number;
}

export async function listEnquiries(): Promise<EnquiryRow[]> {
  // Newest first; closed ones sink so the inbox reads as a to-do list.
  const { results } = await getDb()
    .prepare(
      `SELECT id, name, email, phone, message, locale, source, status, created_at
         FROM enquiries
        ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END, created_at DESC`
    )
    .all<EnquiryRow>();
  return results;
}

/** Returns whether a row matched -- same convention as blog.ts's updatePost. */
export async function updateEnquiryStatus(id: string, status: EnquiryStatus): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE enquiries SET status = ?1 WHERE id = ?2")
    .bind(status, id)
    .run();
  return result.meta.changes > 0;
}
