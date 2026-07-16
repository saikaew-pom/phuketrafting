"use client";

import { useTransition } from "react";
import type { ReviewRow } from "@/lib/queries/reviews";

interface TourOption {
  id: string;
  name: string;
}

interface Props {
  review: ReviewRow | null; // null = new
  tours: TourOption[];
  action: (formData: FormData) => void;
  onDelete?: () => Promise<void>;
}

export function ReviewForm({ review, tours, action, onDelete }: Props) {
  const [deletePending, startDeleteTransition] = useTransition();

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm(`Delete the review by "${review?.guest_name ?? "this guest"}"? This cannot be undone.`)) return;
    startDeleteTransition(() => {
      onDelete();
    });
  }

  return (
    <form action={action} className="pr-dash-form">
      <div className="pr-dash-card">
        <div className="pr-dash-form">
          <label className="pr-dash-field">
            Guest name
            <input name="guest_name" defaultValue={review?.guest_name ?? ""} required />
          </label>
          <label className="pr-dash-field">
            Guest place
            <input name="guest_place" defaultValue={review?.guest_place ?? ""} placeholder="e.g. Australia" />
          </label>
          <label className="pr-dash-field">
            Rating
            <select name="rating" defaultValue={review?.rating ?? 5}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)} ({n})
                </option>
              ))}
            </select>
          </label>
          <label className="pr-dash-field">
            Review text
            <textarea name="content" rows={4} defaultValue={review?.content ?? ""} required />
          </label>
          <label className="pr-dash-field">
            About
            <select name="tour_id" defaultValue={review?.tour_id ?? ""}>
              <option value="">Riverside Camping / general</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="pr-dash-field-hint">Reviews linked to a tour also feed that tour card&apos;s star rating.</span>
          </label>
          <label className="pr-dash-field">
            Sort order
            <input type="number" step="1" min="0" name="sort_order" defaultValue={review?.sort_order ?? 0} />
          </label>
          <label className="pr-dash-check">
            <input type="checkbox" name="is_published" defaultChecked={review ? review.is_published === 1 : false} /> Published
            (visible on the site)
          </label>
        </div>
      </div>

      <div className="pr-dash-actions">
        <button type="submit" className="pr-dash-btn">
          Save
        </button>
        {onDelete && (
          <button type="button" className="pr-dash-btn pr-dash-btn-danger" onClick={handleDelete} disabled={deletePending}>
            {deletePending ? "Deleting..." : "Delete review"}
          </button>
        )}
      </div>
    </form>
  );
}
