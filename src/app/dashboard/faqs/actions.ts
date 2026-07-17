"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/access";
import { createFaq, updateFaq, deleteFaq, moveFaq } from "@/lib/queries/faqs";

function revalidateFaqs(): void {
  revalidatePath("/dashboard/faqs");
  revalidatePath("/[lang]", "page"); // the public FAQ section + its JSON-LD
}

export async function addFaq(formData: FormData): Promise<void> {
  await requireStaff();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return; // both required; the form marks them so
  await createFaq(question, answer);
  revalidateFaqs();
}

export async function saveFaq(id: string, formData: FormData): Promise<void> {
  await requireStaff();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return;
  const isActive = formData.get("is_active") === "on";
  await updateFaq(id, question, answer, isActive);
  revalidateFaqs();
}

export async function removeFaq(id: string): Promise<void> {
  await requireStaff();
  await deleteFaq(id);
  revalidateFaqs();
}

export async function moveFaqAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveFaq(id, direction);
  revalidateFaqs();
}
