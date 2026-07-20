"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { createTag, renameTag, deleteTag, moveTag } from "@/lib/queries/tags";

function revalidateTags(): void {
  revalidatePath("/dashboard/tags");
  // The gallery's per-photo tag chips read tag names/order from here too.
  revalidatePath("/dashboard/gallery");
}

// Matches the <input maxLength={40}> on both the add and rename forms. That
// attribute is purely advisory (HTML-level, client-only) -- same bypassable-
// via-a-direct-POST gap as gallery/actions.ts's MAX_CAPTION_LENGTH and
// bookings/actions.ts's FIELD_MAX_LENGTHS ("a raw POST with a 5,000-char hotel
// field was accepted with zero rejection before this"). Confirmed live here
// too: a form submit with the name input's value set past 40 chars via script
// (bypassing maxLength the same way a non-browser POST would) was accepted
// and stored a 500+ character tag name with zero rejection, before this check
// existed.
const MAX_TAG_NAME_LENGTH = 40;

export async function addTagAction(formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard/tags?error=name_required");
  if (name.length > MAX_TAG_NAME_LENGTH) redirect("/dashboard/tags?error=name_too_long");
  await createTag(name);
  revalidateTags();
  redirect("/dashboard/tags?saved=1");
}

export async function renameTagAction(id: string, formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/dashboard/tags?error=name_required");
  if (name.length > MAX_TAG_NAME_LENGTH) redirect("/dashboard/tags?error=name_too_long");
  await renameTag(id, name);
  revalidateTags();
  redirect("/dashboard/tags?saved=1");
}

export async function removeTagAction(id: string): Promise<void> {
  await requireStaff();
  await deleteTag(id);
  revalidateTags();
  redirect("/dashboard/tags?saved=1");
}

export async function moveTagAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveTag(id, direction);
  revalidateTags();
}
