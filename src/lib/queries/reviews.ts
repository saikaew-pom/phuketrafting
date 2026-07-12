import { getDb } from "@/lib/db";

export interface Review {
  id: number;
  guest_name: string;
  guest_place: string | null;
  rating: number;
  content: string;
  tour_id: string | null;
}

export async function listPublishedReviews(): Promise<Review[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, guest_name, guest_place, rating, content, tour_id
         FROM reviews
        WHERE is_published = 1
        ORDER BY sort_order, id`
    )
    .all<Review>();
  return results;
}

export interface TourReviewStats {
  tour_id: string;
  avg_rating: number;
  review_count: number;
}

/** Real per-tour rating aggregates -- used instead of fabricated marketing numbers. */
export async function listTourReviewStats(): Promise<TourReviewStats[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT tour_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
         FROM reviews
        WHERE is_published = 1 AND tour_id IS NOT NULL
        GROUP BY tour_id`
    )
    .all<TourReviewStats>();
  return results;
}
