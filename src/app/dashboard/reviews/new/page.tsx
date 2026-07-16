import { listTours } from "@/lib/queries/tours";
import { createReviewAction } from "../actions";
import { ReviewForm } from "../ReviewForm";

export default async function NewReviewPage() {
  const tours = await listTours();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>New review</h1>
      </div>
      <ReviewForm review={null} tours={tours.map((t) => ({ id: t.id, name: t.name }))} action={createReviewAction} />
    </div>
  );
}
