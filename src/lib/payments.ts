import Stripe from "stripe";

/**
 * The single interface the rest of the app talks to for payments -- plan §4:
 * "Payment layer still lives behind one lib/payments.js interface as good
 * hygiene." Nothing outside this module should import `stripe` directly, so
 * the provider stays swappable and every Workers-specific quirk lives in one
 * place.
 */

export interface StripeConfig {
  STRIPE_SECRET_KEY?: string;
}

export interface StripeWebhookConfig extends StripeConfig {
  STRIPE_WEBHOOK_SECRET?: string;
}

/**
 * Pinned deliberately, not left to the SDK's default.
 *
 * This value must match the API version configured on the Stripe webhook
 * DESTINATION, because that's what decides the shape of the event JSON Stripe
 * sends us -- and this SDK's TypeScript types describe exactly this version.
 * Leaving it implicit means a routine `npm update stripe` silently bumps the
 * version our requests use and desyncs it from the destination, with no
 * compile error and no test failure: the first symptom would be a field
 * quietly reading undefined on a real payment.
 *
 * If you change this, change the destination's API version to match (Stripe
 * dashboard -> Webhooks -> the destination -> API version).
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/**
 * Built per call, never cached in module scope.
 *
 * The SDK defaults to a Node http client, which does not exist on workerd.
 * `stripe`'s package exports do declare a "workerd" condition that resolves
 * to a fetch-based build, but that depends on the bundler honouring the
 * condition -- OpenNext builds this code through Next's server bundler, so
 * relying on it silently would be a bet, and the failure mode is a runtime
 * explosion on the first real payment. Passing the fetch client explicitly is
 * correct under either resolution and costs nothing.
 *
 * Returns null (rather than throwing) when unconfigured, so callers can treat
 * "payments aren't set up yet" as a normal state -- same contract as
 * brevo.ts's send functions, and the reason a booking can still be created
 * before Stripe exists.
 */
function getStripe(config: StripeConfig): Stripe | null {
  const key = config.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    // The SDK defaults (timeout 80_000, maxNetworkRetries 2) are wrong for
    // this call site. createCheckoutSession is awaited INSIDE the booking
    // Server Action, so the guest's "Booked!" message is blocked on Stripe
    // answering. On the defaults a Stripe outage costs up to 3 x 80s plus
    // backoff -- ~4 minutes of spinner -- before checkout.ts's fail-open path
    // ever runs. That defeats the point of failing open: a guest who waits
    // four minutes concludes it didn't work and rebooks, double-claiming a
    // seat, which is the exact failure checkout.ts exists to prevent.
    //
    // Session creation is a single sub-second POST in the normal case, so a
    // short bound costs nothing real and caps the worst case at ~16s + backoff.
    // One retry still absorbs a transient blip; the idempotency key on the
    // create call makes that retry safe (it can't mint a second session).
    timeout: 8000,
    maxNetworkRetries: 1,
  });
}

/**
 * THB is a 2-decimal currency in Stripe's API: amounts are in satang, so
 * ฿1,667 is 166700. Rounding here is belt-and-braces -- pricing.ts's
 * splitPayment already returns a whole-baht deposit -- but `total` itself is
 * never rounded (a REAL column; a percentage promo can yield ฿4,000.2), so a
 * fractional baht could in principle reach this. Math.round keeps it a valid
 * integer minor unit instead of Stripe rejecting the request outright.
 */
export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}

/** Re-exported so route handlers can type events without importing `stripe`. */
export type StripeEvent = Stripe.Event;
export type StripeCheckoutSession = Stripe.Checkout.Session;
export type StripeCharge = Stripe.Charge;

/**
 * Verifies a Stripe webhook's signature and returns the parsed event.
 *
 * THROWS on any bad/missing/expired signature -- the caller must treat that as
 * a rejected request, never as a processable event. This is the entire
 * security boundary of the webhook: without it, anyone who knows the endpoint
 * URL could POST a forged "payment succeeded" and mark bookings paid.
 *
 * Two Workers-specific requirements, both easy to get silently wrong:
 *  - constructEventAsync, not constructEvent: the sync version needs Node's
 *    crypto for HMAC. On workerd only the async path (backed by SubtleCrypto)
 *    works.
 *  - `rawBody` must be the EXACT bytes Stripe sent. The signature is computed
 *    over the raw payload, so any re-serialisation (JSON.parse -> stringify,
 *    or a framework body parser) changes whitespace/key order and every
 *    signature fails. Callers must pass request.text() and nothing else.
 */
export async function constructWebhookEvent(
  rawBody: string,
  signature: string,
  config: StripeWebhookConfig
): Promise<Stripe.Event> {
  const stripe = getStripe(config);
  if (!stripe) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");

  const secret = config.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");

  return stripe.webhooks.constructEventAsync(rawBody, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
}

export interface CheckoutSessionInput {
  bookingId: string;
  /** Whole baht to collect NOW -- normally the deposit, not the total. */
  amountBaht: number;
  productName: string;
  guestEmail: string | null;
  /** Absolute URLs; Stripe rejects relative ones. */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

/**
 * Creates a hosted Checkout Session for a booking's deposit.
 *
 * Called only AFTER the booking row exists (plan §4: "created server-side
 * only after checkSlotCapacity passes and a pending booking row exists") --
 * the booking, not the payment, is the durable record, and the seat is
 * already claimed by then.
 *
 * Returns null when Stripe isn't configured. Throws on a real API failure so
 * the caller can decide -- it must NOT discard the booking, which already
 * holds a seat.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
  config: StripeConfig
): Promise<CheckoutSessionResult | null> {
  const stripe = getStripe(config);
  if (!stripe) return null;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "thb",
            unit_amount: bahtToSatang(input.amountBaht),
            product_data: {
              name: input.productName,
              description: `Deposit to reserve your booking. The balance is payable on the day.`,
            },
          },
        },
      ],
      // Lets the guest change their mind at Stripe's page without stranding
      // the booking: cancel_url returns them to their own manage page, where
      // the booking still exists and staff can still help.
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.guestEmail ? { customer_email: input.guestEmail } : {}),
      // The webhook (5c) receives the session, not our booking -- this is the
      // only thing tying a Stripe payment back to a row in D1. client_reference_id
      // rather than metadata because Stripe surfaces it as a first-class
      // searchable field in the dashboard, which is what staff will use when
      // reconciling a payment by hand.
      client_reference_id: input.bookingId,
      metadata: { booking_id: input.bookingId },
      // Session metadata does NOT cascade to the PaymentIntent -- that's what
      // this parameter is for ("pass on metadata to a ... PaymentIntent
      // created from a CheckoutSession"). The PaymentIntent DOES copy its own
      // metadata onto the Charge it creates, so this is the only link that
      // puts booking_id on a Charge.
      //
      // Load-bearing for charge.refunded: that event carries a Charge, which
      // has no client_reference_id and never sees the session's metadata. Without
      // this, charge.metadata.booking_id is undefined and every refund silently
      // no-ops -- the webhook 200s, and nothing is recorded.
      //
      // Kept in sync with metadata above; both are set from the same bookingId.
      payment_intent_data: { metadata: { booking_id: input.bookingId } },
    },
    // Stripe-side idempotency: a double-submit or a retry that reaches this
    // twice for the same booking returns the SAME session rather than a
    // second one, so a guest can never end up with two payment links (and two
    // charges) for one seat. Keyed on the booking id, which is a UUID minted
    // per booking.
    { idempotencyKey: `checkout:${input.bookingId}` }
  );

  // `url` is documented as nullable (it's null for some modes/states this
  // call doesn't use). Treat a null as a real failure rather than handing the
  // caller a session it can't send anyone to.
  if (!session.url) {
    throw new Error(`Stripe returned a session with no url (id=${session.id})`);
  }
  return { id: session.id, url: session.url };
}
