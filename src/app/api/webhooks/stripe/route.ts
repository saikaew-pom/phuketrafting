import { getCloudflareContext } from "@opennextjs/cloudflare";
import { constructWebhookEvent, bahtToSatang, type StripeEvent, type StripeCheckoutSession, type StripeCharge } from "@/lib/payments";
import { claimStripeEvent, markStripeEventProcessed, releaseStripeEventClaim } from "@/lib/queries/stripe-events";
import {
  getBookingDetail,
  markBookingPaid,
  markBookingRefunded,
  releaseUnpaidBooking,
} from "@/lib/queries/bookings";
import { logBookingEvent } from "@/lib/booking";

/**
 * Stripe webhook (plan §4). The app's only unauthenticated write endpoint --
 * its entire security boundary is the signature check below.
 *
 * force-dynamic because a cached webhook would be absurd, and because this
 * must never be prerendered at build time (no request, no D1).
 */
export const dynamic = "force-dynamic";

/**
 * Resolves the booking id Stripe is telling us about.
 *
 * client_reference_id is what lib/payments.ts sets on the session; metadata is
 * the fallback, set in the same call. Both are ours -- Stripe echoes them back
 * verbatim and never invents them -- but they arrive over the wire, so they're
 * only trusted because the payload's signature was already verified. Nothing
 * here is used to look up anything the guest could have chosen.
 */
function bookingIdFromSession(session: StripeCheckoutSession): string | null {
  return session.client_reference_id ?? session.metadata?.booking_id ?? null;
}

async function handleCheckoutCompleted(session: StripeCheckoutSession): Promise<string> {
  const bookingId = bookingIdFromSession(session);
  if (!bookingId) return "no booking id on session";

  const booking = await getBookingDetail(bookingId);
  if (!booking) return `booking ${bookingId} not found`;

  // What Stripe actually collected vs what we recorded as owed. Compared in
  // satang via bahtToSatang -- NOT deposit_amount * 100 -- because
  // deposit_amount is a REAL column and float arithmetic on it can land a
  // hair off an integer (1667 * 100 -> 166699.99999999999), which would make
  // every payment look mismatched. This should never fire (we set the amount
  // when creating the session and Stripe enforces it), so if it does, it means
  // an assumption is broken: record it and still mark paid, because the money
  // genuinely arrived and refusing to record that would be worse.
  const expected = bahtToSatang(booking.deposit_amount);
  const mismatch = session.amount_total !== null && session.amount_total !== expected;

  const paid = await markBookingPaid(bookingId);
  if (!paid) {
    // Not an error: a duplicate delivery, or staff/refund already moved it on.
    // The claim in stripe_events should stop most of these, but a DIFFERENT
    // event id can still describe an already-paid booking.
    return `booking ${bookingId} not in awaiting_payment (payment_status=${booking.payment_status}) -- no change`;
  }

  await logBookingEvent(bookingId, "stripe", "payment_received", {
    session_id: session.id,
    amount_total: session.amount_total,
    currency: session.currency,
    ...(mismatch ? { expected_satang: expected, MISMATCH: true } : {}),
  });

  if (mismatch) {
    console.error(
      `stripe webhook: amount mismatch on booking ${bookingId} -- charged ${session.amount_total}, expected ${expected}`
    );
  }
  // Deliberately does NOT confirm the booking -- plan §4's human-in-the-loop
  // rule. Staff still press confirm.
  return `booking ${bookingId} marked paid${mismatch ? " (AMOUNT MISMATCH logged)" : ""}`;
}

async function handleCheckoutExpired(session: StripeCheckoutSession): Promise<string> {
  const bookingId = bookingIdFromSession(session);
  if (!bookingId) return "no booking id on session";

  // Frees the seat as well as cancelling -- see releaseUnpaidBooking. Guarded,
  // so a booking staff already confirmed by hand, or one that paid by another
  // route, is left alone.
  const released = await releaseUnpaidBooking(bookingId);
  if (!released) return `booking ${bookingId} not releasable (already paid/confirmed/cancelled) -- no change`;

  await logBookingEvent(bookingId, "stripe", "checkout_expired", { session_id: session.id });
  return `booking ${bookingId} released (checkout expired unpaid)`;
}

async function handleChargeRefunded(charge: StripeCharge): Promise<string> {
  // A charge doesn't carry our client_reference_id (that's on the session), so
  // the booking id has to ride in the charge's own metadata.
  //
  // That works ONLY because createCheckoutSession sets
  // payment_intent_data.metadata: a Checkout Session's own `metadata` does NOT
  // cascade to its PaymentIntent (that's exactly what payment_intent_data is
  // for), though a PaymentIntent DOES copy its metadata onto the Charge it
  // creates. Session -> PI is the manual link; PI -> Charge is the automatic
  // one. Drop payment_intent_data and this lookup returns null on every real
  // refund -- silently, with a 200.
  const bookingId = charge.metadata?.booking_id ?? null;
  if (!bookingId) return `no booking id on charge ${charge.id}`;

  // charge.refunded fires for PARTIAL refunds too, and the event looks
  // identical apart from the amounts. payment_status is a whole-booking fact
  // with no "partially refunded" state, so flipping it on any refund would let
  // a ฿1 goodwill refund mark a ฿1,500 deposit fully returned -- staff would
  // read the booking as refunded and free the seat. Worse, markBookingRefunded
  // is guarded on payment_status = 'paid', so that flip is a one-way door: the
  // REAL full refund arriving later would find the booking already 'refunded',
  // change nothing, and never be logged.
  //
  // So only a full refund moves payment_status. A partial one is still a money
  // fact worth recording, so it gets a log line and leaves the booking 'paid'.
  const isFullRefund = charge.amount_refunded >= charge.amount;

  if (!isFullRefund) {
    await logBookingEvent(bookingId, "stripe", "payment_partially_refunded", {
      charge_id: charge.id,
      amount_refunded: charge.amount_refunded,
      amount: charge.amount,
    });
    return `booking ${bookingId} partially refunded (${charge.amount_refunded}/${charge.amount}) -- payment_status left paid`;
  }

  const refunded = await markBookingRefunded(bookingId);
  if (!refunded) return `booking ${bookingId} not in paid state -- no change`;

  await logBookingEvent(bookingId, "stripe", "payment_refunded", {
    charge_id: charge.id,
    amount_refunded: charge.amount_refunded,
    amount: charge.amount,
  });
  // Deliberately does NOT cancel the booking. A refund is a money fact; whether
  // the guest still has a seat is a staff decision (plan §4 puts refunds behind
  // an admin action with a logged reason), and a partial refund shouldn't cancel
  // anything at all.
  return `booking ${bookingId} marked refunded`;
}

async function handleEvent(event: StripeEvent): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event.data.object as StripeCheckoutSession);
    case "checkout.session.expired":
      return handleCheckoutExpired(event.data.object as StripeCheckoutSession);
    case "charge.refunded":
      return handleChargeRefunded(event.data.object as StripeCharge);
    default:
      // The destination is configured for three types, but that's config, not
      // a guarantee -- someone can add a type in the dashboard at any time.
      // Ignore politely rather than 400, which would make Stripe retry an
      // event we're never going to want.
      return `ignored event type ${event.type}`;
  }
}

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  // MUST be the raw text. The signature is computed over the exact bytes sent;
  // request.json() would re-serialise and break every verification.
  const rawBody = await request.text();

  let event: StripeEvent;
  try {
    event = await constructWebhookEvent(rawBody, signature, env);
  } catch (err) {
    // Covers a forged signature, a wrong/rotated secret, and a replayed
    // payload outside Stripe's timestamp tolerance. 400 (not 500): the request
    // is untrusted and must never be processed, and Stripe should not retry it.
    console.error("stripe webhook: signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Everything below this line is verified-authentic Stripe data.
  try {
    const claim = await claimStripeEvent(event.id, event.type, rawBody);

    if (claim === "processed") {
      // A previous delivery finished the work. 200 so Stripe stops retrying --
      // a duplicate isn't an error.
      return Response.json({ received: true, duplicate: true, id: event.id });
    }

    if (claim === "in_flight") {
      // Another delivery of this same event is mid-handler. Deliberately NOT a
      // 200: if that one fails and releases its claim, a 200 here would have
      // told Stripe the event was handled and killed the only retry that could
      // recover it. 409 keeps Stripe retrying; once the owner commits,
      // processed_at is set and the retry 200s above.
      console.warn(`stripe webhook: ${event.id} already in flight -- asking Stripe to retry`);
      return new Response("Event already in flight", { status: 409 });
    }

    const outcome = await handleEvent(event);
    await markStripeEventProcessed(event.id);
    console.log(`stripe webhook ${event.type} (${event.id}): ${outcome}`);
    return Response.json({ received: true, id: event.id });
  } catch (err) {
    // Release the claim so Stripe's retry can actually reprocess this. Without
    // it the retry would be deduped to a 200 and a transient failure would
    // permanently lose a real payment record -- see releaseStripeEventClaim.
    console.error(`stripe webhook: handler failed for ${event.type} (${event.id})`, err);
    try {
      await releaseStripeEventClaim(event.id);
    } catch (releaseErr) {
      // Already failing; a lost release just costs one wasted retry.
      console.error(`stripe webhook: could not release claim for ${event.id}`, releaseErr);
    }
    // 500 asks Stripe to retry, and keeps the destination's error rate
    // non-zero so a human sees it.
    return new Response("Handler error", { status: 500 });
  }
}
