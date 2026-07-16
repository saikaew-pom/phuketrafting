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

// -- Dashboard (staff-only) CRUD below. Plan §3: "Reviews: curated review
// entries, publish toggle" -- the read path above shipped in Phase 3, the
// editing capability is what the CMS coverage audit found missing:
// is_published and sort_order existed purely for a UI that didn't.

export interface ReviewRow extends Review {
  is_published: number;
  sort_order: number;
}

export async function listAllReviews(): Promise<ReviewRow[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, guest_name, guest_place, rating, content, tour_id, is_published, sort_order
         FROM reviews ORDER BY sort_order, id`
    )
    .all<ReviewRow>();
  return results;
}

export async function getReview(id: number): Promise<ReviewRow | null> {
  return getDb()
    .prepare(
      `SELECT id, guest_name, guest_place, rating, content, tour_id, is_published, sort_order
         FROM reviews WHERE id = ?1`
    )
    .bind(id)
    .first<ReviewRow>();
}

export interface ReviewInput {
  guest_name: string;
  guest_place: string;
  rating: number;
  content: string;
  /** null = a camping/general review (renders as "Riverside Camping" on the site). */
  tour_id: string | null;
  is_published: boolean;
  sort_order: number;
}

export async function createReview(input: ReviewInput): Promise<number> {
  const result = await getDb()
    .prepare(
      `INSERT INTO reviews (guest_name, guest_place, rating, content, tour_id, is_published, sort_order)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(
      input.guest_name,
      input.guest_place || null,
      input.rating,
      input.content,
      input.tour_id,
      input.is_published ? 1 : 0,
      input.sort_order
    )
    .run();
  return Number(result.meta.last_row_id);
}

/** Returns whether a row matched -- same convention as blog.ts's updatePost. */
export async function updateReview(id: number, input: ReviewInput): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE reviews
          SET guest_name = ?1, guest_place = ?2, rating = ?3, content = ?4,
              tour_id = ?5, is_published = ?6, sort_order = ?7
        WHERE id = ?8`
    )
    .bind(
      input.guest_name,
      input.guest_place || null,
      input.rating,
      input.content,
      input.tour_id,
      input.is_published ? 1 : 0,
      input.sort_order,
      id
    )
    .run();
  return result.meta.changes > 0;
}

export async function deleteReview(id: number): Promise<boolean> {
  const result = await getDb().prepare("DELETE FROM reviews WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}
