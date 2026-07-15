import { getDb } from "@/lib/db";

// 1:1 with migrations/0005_bookings.sql's booking_participants table -- same
// convention as queries/bookings.ts's Booking interface.
export interface BookingParticipant {
  id: number;
  booking_id: string;
  name: string;
  age: number | null;
  health_declaration: string | null;
  waiver_signed_at: number | null;
  signature_text: string | null;
  created_at: number;
}

export interface ParticipantInput {
  name: string;
  age: number | null;
  healthDeclaration: string | null;
  signatureText: string;
}

export async function listParticipants(bookingId: string): Promise<BookingParticipant[]> {
  const { results } = await getDb()
    .prepare(
      `SELECT id, booking_id, name, age, health_declaration, waiver_signed_at, signature_text, created_at
         FROM booking_participants
        WHERE booking_id = ?1
        ORDER BY id`
    )
    .bind(bookingId)
    .all<BookingParticipant>();
  return results;
}

/**
 * Replaces a booking's entire participant list in one atomic db.batch().
 *
 * Replace-all rather than upsert-by-id: the guest-facing waiver form renders
 * one row per booked seat and submits the whole set every time, so "what the
 * guest just submitted" IS the complete truth for this booking -- there is no
 * partial-update case to model. It also means a re-submission (guest fixes a
 * typo in a name, corrects an age) can't strand orphaned rows from the prior
 * submission, which an insert-only path would.
 *
 * db.batch() for the same reason as createTourBooking's INSERT+UPDATE pair:
 * D1 has no BEGIN/COMMIT, but it runs a batch as one transaction, so the
 * DELETE and the INSERTs cannot be observed half-applied -- without it, a
 * Worker eviction between the two calls would leave a booking with ZERO
 * waivers on file (worse than the stale set it started with) and no way for
 * the guest to know their re-submission silently destroyed the old one.
 *
 * waiver_signed_at is stamped server-side via unixepoch(), never taken from
 * the client -- this column is a legal/insurance record (plan §7), so the
 * signing time must be the server's, not whatever a request body claims.
 */
export async function replaceParticipants(bookingId: string, participants: ParticipantInput[]): Promise<void> {
  const db = getDb();

  const statements = [
    db.prepare("DELETE FROM booking_participants WHERE booking_id = ?1").bind(bookingId),
    ...participants.map((p) =>
      db
        .prepare(
          `INSERT INTO booking_participants (booking_id, name, age, health_declaration, waiver_signed_at, signature_text)
           VALUES (?1, ?2, ?3, ?4, unixepoch(), ?5)`
        )
        .bind(bookingId, p.name, p.age, p.healthDeclaration, p.signatureText)
    ),
  ];

  await db.batch(statements);
}
