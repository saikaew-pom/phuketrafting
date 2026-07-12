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
