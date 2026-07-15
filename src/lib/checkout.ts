import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createCheckoutSession } from "@/lib/payments";
import { getBookingDetail, recordCheckoutSession } from "@/lib/queries/bookings";
import { getRequestOrigin } from "@/lib/request-origin";
import { getPaymentPolicy } from "@/lib/queries/settings";
import { logBookingEvent, type CreateBookingResult } from "@/lib/booking";

/**
 * Opens a Stripe Checkout session for a freshly-created booking and returns
 * the URL to send the guest to, or null if there's no payment step.
 *
 * Lives here rather than in either *-actions.ts file for a security reason,
 * not a stylistic one: every export of a "use server" module becomes a real
 * Server Action with its own POST endpoint, so a shared helper exported from
 * one would be directly callable by anyone -- an unauthenticated "open a
 * Checkout session for booking X" endpoint. A plain module can be imported by
 * both actions without becoming an entry point.
 *
 * NEVER throws. By the time this runs the booking row exists and its seat is
 * claimed, so a Stripe outage must not turn a real booking into an error the
 * guest reads as "it didn't work" -- they'd rebook and double-claim. Same
 * fail-open reasoning as booking.ts's runPostCommitEffect and brevo.ts's
 * enquiry notification. Returning null degrades to "booked, we'll be in
 * touch", and the failure is recorded on the booking's own activity log so
 * staff can chase the payment by hand.
 */
export async function openCheckoutForBooking(result: CreateBookingResult): Promise<string | undefined> {
  const bookingId = result.bookingId;
  if (!bookingId) return undefined;

  // No deposit owed -- a pay_on_day policy, or a fully-discounted booking.
  // Nothing to collect, so no Checkout session: Stripe rejects a zero-amount
  // line item anyway, and sending a guest to a payment page for THB 0 would
  // be nonsense.
  if (!result.depositAmount || result.depositAmount <= 0) return undefined;

  try {
    const { env } = getCloudflareContext();
    if (!env.STRIPE_SECRET_KEY) return undefined;

    const origin = await getRequestOrigin();
    if (!origin) {
      console.error(`checkout: no request origin for booking ${bookingId}, skipping Checkout`);
      return undefined;
    }

    // One read to get the product name, guest email and the manage token,
    // rather than threading them through every caller. The row was written
    // moments ago in the same request.
    const booking = await getBookingDetail(bookingId);
    if (!booking) return undefined;

    const manageUrl = booking.manage_token
      ? `${origin}/${booking.locale}/manage/${booking.manage_token}`
      : `${origin}/${booking.locale}`;

    const session = await createCheckoutSession(
      {
        bookingId,
        amountBaht: result.depositAmount,
        productName: booking.product_name ?? "Phuket Rafting booking",
        guestEmail: booking.guest_email,
        // Both land on the guest's own manage page: it already shows the
        // booking, its status and the cancel/reschedule form, so it's the
        // truthful destination whether they paid or backed out. Notably it
        // does NOT claim "payment received" -- only the webhook (5c) knows
        // that, and the guest may arrive here before it fires.
        successUrl: manageUrl,
        cancelUrl: manageUrl,
        // Read from settings, not hardcoded, so this can never disagree with
        // the sweeper's cutoff -- both call getPaymentPolicy().
        holdMinutes: (await getPaymentPolicy()).holdMinutes,
      },
      env
    );
    if (!session) return undefined;

    // Best-effort: the session exists at Stripe regardless, and the webhook
    // resolves the booking via client_reference_id, not this column. Losing
    // it costs staff a manual lookup, not the payment.
    const recorded = await recordCheckoutSession(bookingId, session.id);
    if (!recorded) {
      console.error(`checkout: booking ${bookingId} vanished before session id could be stored`);
    }

    return session.url;
  } catch (err) {
    // Logged to the booking's own activity trail, not just the console, so
    // staff see "this guest was never asked to pay" on the booking itself.
    console.error(`checkout: failed to open Checkout for booking ${bookingId}`, err);
    try {
      await logBookingEvent(bookingId, "system", "checkout_open_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Nothing left to do -- never let bookkeeping sink a real booking.
    }
    return undefined;
  }
}
