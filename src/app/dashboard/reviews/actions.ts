"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { createReview, updateReview, deleteReview, type ReviewInput } from "@/lib/queries/reviews";
import { getTour } from "@/lib/queries/tours";

async function readInput(formData: FormData): Promise<ReviewInput> {
  const guest_name = String(formData.get("guest_name") ?? "").trim();
  if (!guest_name) throw new Error("Guest name is required.");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("Review text is required.");

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Rating must be 1-5.");

  const sort_order = Number(String(formData.get("sort_order") ?? "0").trim() || "0");
  if (!Number.isInteger(sort_order) || sort_order < 0) throw new Error("Invalid sort order.");

  // "" = the camping/general option. A non-empty id is a claim -- verify the
  // tour actually exists rather than trusting the <select> (same trust-
  // boundary rule as every other client-supplied id in this codebase).
  const rawTourId = String(formData.get("tour_id") ?? "").trim();
  let tour_id: string | null = null;
  if (rawTourId) {
    const tour = await getTour(rawTourId);
    if (!tour) throw new Error("That tour no longer exists.");
    tour_id = tour.id;
  }

  return {
    guest_name,
    guest_place: String(formData.get("guest_place") ?? "").trim(),
    rating,
    content,
    tour_id,
    is_published: formData.get("is_published") === "on",
    sort_order,
  };
}

export async function createReviewAction(formData: FormData): Promise<void> {
  await requireStaff();
  const input = await readInput(formData);
  await createReview(input);
  revalidatePath("/dashboard/reviews");
  redirect("/dashboard/reviews");
}

export async function saveReviewAction(reviewId: number, formData: FormData): Promise<void> {
  await requireStaff();
  const input = await readInput(formData);
  const ok = await updateReview(reviewId, input);
  if (!ok) throw new Error("That review no longer exists.");
  revalidatePath("/dashboard/reviews");
  revalidatePath(`/dashboard/reviews/${reviewId}`);
}

export async function deleteReviewAction(reviewId: number): Promise<void> {
  await requireStaff();
  const ok = await deleteReview(reviewId);
  if (!ok) throw new Error("That review no longer exists.");
  revalidatePath("/dashboard/reviews");
  redirect("/dashboard/reviews");
}
