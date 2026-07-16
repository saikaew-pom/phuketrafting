import { notFound } from "next/navigation";
import { getReview } from "@/lib/queries/reviews";
import { listTours } from "@/lib/queries/tours";
import { saveReviewAction, deleteReviewAction } from "../actions";
import { ReviewForm } from "../ReviewForm";

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) notFound();

  const [review, tours] = await Promise.all([getReview(reviewId), listTours()]);
  if (!review) notFound();

  const saveWithId = saveReviewAction.bind(null, reviewId);
  const deleteWithId = deleteReviewAction.bind(null, reviewId);

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Review by {review.guest_name}</h1>
      </div>
      <ReviewForm
        review={review}
        tours={tours.map((t) => ({ id: t.id, name: t.name }))}
        action={saveWithId}
        onDelete={deleteWithId}
      />
    </div>
  );
}
