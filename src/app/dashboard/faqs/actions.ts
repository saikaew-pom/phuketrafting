"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { createFaq, updateFaq, deleteFaq, moveFaq } from "@/lib/queries/faqs";

function revalidateFaqs(): void {
  revalidatePath("/dashboard/faqs");
  revalidatePath("/[lang]", "page"); // the public FAQ section + its JSON-LD
}

const fail = (code: string) => redirect(`/dashboard/faqs?error=${code}`);

// Both fields carry `required` client-side, so this is the backstop for a
// direct POST bypassing that -- same "client input is a claim" stance as
// every other Server Action in this codebase. It used to `return` silently
// on a blank field: no error, no save, the page just reloaded unchanged with
// no indication anything was rejected -- every sibling screen (tags, addons,
// categories, camping) instead redirects with a friendly ?error= banner.
export async function addFaq(formData: FormData): Promise<void> {
  await requireStaff();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) fail("fields_required");
  await createFaq(question, answer);
  revalidateFaqs();
  // Redirect on success too, not just on the error path -- same shape as
  // tags/addons/camping's own addX/renameX actions. Without this, a save that
  // succeeds right after a rejected one left the PREVIOUS ?error=
  // fields_required banner sitting in the URL/on screen (revalidateFaqs()
  // alone re-renders at the current URL, which still carries the old query
  // string) -- confirmed live: submit blank, then submit a valid question,
  // and the "Both question and answer are required" banner kept showing even
  // though the new question had just saved.
  redirect("/dashboard/faqs?saved=1");
}

export async function saveFaq(id: string, formData: FormData): Promise<void> {
  await requireStaff();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) fail("fields_required");
  const isActive = formData.get("is_active") === "on";
  await updateFaq(id, question, answer, isActive);
  revalidateFaqs();
  // Same reasoning as addFaq above.
  redirect("/dashboard/faqs?saved=1");
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
