import { getDb } from "@/lib/db";

/**
 * Idempotency store for Stripe webhooks (plan §4: "idempotent by event id
 * (stripe_events table)"). See migrations/0008_stripe_and_consent.sql -- `id`
 * IS Stripe's own evt_... id, which is why this needs no id generation and
 * gets its idempotency free from the PRIMARY KEY.
 */

/**
 * Atomically claims an event for processing. Returns false if it was already
 * claimed, meaning the caller must NOT process it again.
 *
 * Stripe retries a webhook until it gets a 2xx, and explicitly does not
 * guarantee at-most-once delivery -- a slow response, a network blip, or a
 * genuine duplicate all mean the same event id can arrive more than once, and
 * two deliveries can be in flight CONCURRENTLY. Processing twice would double
 * an effect that must happen once (e.g. releasing a seat twice on
 * checkout.session.expired, decrementing booked_count below reality).
 *
 * The claim is the INSERT itself rather than a SELECT-then-INSERT: D1 has no
 * BEGIN/COMMIT, so a read-then-write leaves a window where two concurrent
 * deliveries both see "not processed" and both proceed. `ON CONFLICT DO
 * NOTHING` makes the PRIMARY KEY do the arbitration in one statement -- same
 * fold-the-check-into-the-write pattern as the capacity claims in
 * scheduling.ts and the notification claims in queries/notifications.ts.
 *
 * The full payload is stored on claim (before processing) so a failure leaves
 * a forensic record of what Stripe actually sent, not just that something
 * arrived.
 */
export type StripeEventClaim =
  /** This delivery owns the event and must process it. */
  | "claimed"
  /** Already processed to completion -- safe to 200 without redoing the work. */
  | "processed"
  /** Claimed by another delivery that hasn't finished (or died mid-flight). */
  | "in_flight";

export async function claimStripeEvent(id: string, type: string, payload: string): Promise<StripeEventClaim> {
  const result = await getDb()
    .prepare("INSERT INTO stripe_events (id, type, payload) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO NOTHING")
    .bind(id, type, payload)
    .run();
  if (result.meta.changes > 0) return "claimed";

  // Lost the race (or this is a genuine redelivery). "Already in the table" is
  // NOT the same as "already done", and conflating them loses events:
  //
  //   A claims -> B arrives, sees the row, 200s as a duplicate -> A's handler
  //   throws, releases the claim, 500s. Stripe already has a 200 for this
  //   event id, so it stops retrying. Nobody ever processed it, and the
  //   release deleted the forensic row too.
  //
  // So only processed_at -- the mark of completed work -- earns a 200. The
  // extra read costs nothing on the hot path: it only runs on conflict, which
  // is by definition the rare case.
  const row = await getDb()
    .prepare("SELECT processed_at FROM stripe_events WHERE id = ?1")
    .bind(id)
    .first<{ processed_at: number | null }>();

  // Row already gone => the owner released a failed claim between our INSERT
  // and this SELECT. Treat as in_flight: a retry is exactly what's wanted.
  return row?.processed_at != null ? "processed" : "in_flight";
}

/** Marks a claimed event as successfully handled. */
export async function markStripeEventProcessed(id: string): Promise<void> {
  await getDb().prepare("UPDATE stripe_events SET processed_at = unixepoch() WHERE id = ?1").bind(id).run();
}

/**
 * Drops a claim whose handler threw, so Stripe's retry of the same event id
 * can genuinely reprocess it.
 *
 * Without this the claim is a one-way door: the retry hits claimStripeEvent,
 * gets refused as a duplicate, returns 200, and Stripe stops -- so a purely
 * transient failure (a D1 blip mid-handler) would permanently lose a real
 * payment record, with the row sitting there claimed-but-unprocessed forever.
 * Releasing the claim converts the retry Stripe is already going to send into
 * the recovery mechanism.
 *
 * The cost is that a DETERMINISTIC failure (a code bug, a malformed payload)
 * now retries for as long as Stripe retries instead of failing once. That's
 * the right trade: those retries all fail identically and keep the
 * destination's error rate visibly non-zero, which is exactly the signal a
 * human should get -- versus a silent single failure nobody notices until a
 * guest asks where their money went.
 *
 * Best-effort by design: the caller is already in a failure path and must
 * still return 500. Losing the release only costs a retry.
 */
export async function releaseStripeEventClaim(id: string): Promise<void> {
  await getDb().prepare("DELETE FROM stripe_events WHERE id = ?1 AND processed_at IS NULL").bind(id).run();
}
