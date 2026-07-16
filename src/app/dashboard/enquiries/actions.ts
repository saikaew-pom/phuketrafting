"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { updateEnquiryStatus, type EnquiryStatus } from "@/lib/queries/enquiries";

const VALID: readonly EnquiryStatus[] = ["new", "contacted", "closed"];

export async function setEnquiryStatus(enquiryId: string, status: string): Promise<void> {
  await requireStaff();
  if (!VALID.includes(status as EnquiryStatus)) throw new Error("Invalid status");
  const ok = await updateEnquiryStatus(enquiryId, status as EnquiryStatus);
  if (!ok) throw new Error("That enquiry no longer exists.");
  revalidatePath("/dashboard/enquiries");
}
