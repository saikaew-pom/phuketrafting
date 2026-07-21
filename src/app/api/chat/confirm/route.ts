import { z } from "zod";
import { getDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { createTourBooking } from "@/lib/booking";
import { getChatPolicy } from "@/lib/queries/settings";
import { appendMessage } from "@/lib/queries/conversations";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";
import { sendBookingAck } from "@/lib/booking-ack";

/**
 * The ONLY path that turns a chatbot draft into a real booking (plan §9's
 * "confirm" step).
 *
 * Reached exclusively by the guest pressing Confirm on the review card -- the
 * model cannot call this, has no tool for it, and never sees this route. That
 * separation is the entire safety design: the model may only propose a draft;
 * a human accepts it; and this route re-derives EVERYTHING from D1 rather than
 * trusting anything the model said.
 *
 * The draft token is the capability. Not the chat sessionId, which is
 * client-supplied and therefore carries no authority (see /api/chat).
 */
export const dynamic = "force-dynamic";

const ConfirmSchema = z.object({
  token: z.string().trim().uuid("Invalid confirmation"),
  // Collected by the CARD as real form fields, not by the model. Plan §9 is
  // explicit about why they're absent from the AI tool schema: "required
  // fields make the model invent placeholders" -- a model asked for a required
  // phone will emit "0812345678" rather than admit it doesn't know, and that
  // fake number would ride into a real booking.
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  // E.164-ish. Deliberately permissive on separators (guests type +66 81 234
  // 5678) but strict that it's a real international number, since staff phone
  // guests to arrange pickup.
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\+?[1-9]\d{7,14}$/, "Please enter a valid phone number, e.g. +66 81 234 5678.")),
  email: z.string().trim().email("Please enter a valid email address.").optional().or(z.literal("")),
});

export async function POST(request: Request): Promise<Response> {
  const db = getDb();

  const cfIp = request.headers.get("cf-connecting-ip");
  // Same 5/60s as the public booking widget -- this creates the same kind of
  // row and consumes the same real inventory.
  const allowed = await checkRateLimit(`chat-confirm:${cfIp ?? "no-cf-ip"}`, 5, 60);
  if (!allowed) {
    return Response.json({ error: "Too many requests -- please wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Please check your details." }, { status: 400 });
  }
  const { token, name, phone, email } = parsed.data;

  try {
    // Booking mode can be switched off mid-conversation. Re-checked here, not
    // just where the card was issued: a draft created a minute ago must not
    // still be confirmable after staff pull the switch.
    const policy = await getChatPolicy();
    if (!policy.enabled || !policy.bookingMode) {
      return Response.json(
        { error: `Online booking isn't available right now -- please message us on WhatsApp: https://wa.me/${WHATSAPP_NUMBER}` },
        { status: 403 }
      );
    }

    // Claim the draft with a guarded UPDATE rather than SELECT-then-UPDATE.
    // D1 has no BEGIN/COMMIT, so a read-then-write lets a double-tapped
    // Confirm (or a replayed request) pass the check twice and create TWO
    // bookings against one draft -- double-charging the guest and
    // double-claiming seats. Folding the check into the write means exactly
    // one caller can ever win, whatever the concurrency.
    const claim = await db
      .prepare(
        `UPDATE chat_booking_drafts SET consumed_at = unixepoch()
          WHERE token = ?1 AND consumed_at IS NULL AND expires_at > unixepoch()`
      )
      .bind(token)
      .run();

    if (claim.meta.changes === 0) {
      // Distinguish the reasons -- a guest who dawdled deserves a different
      // message from one who double-tapped. Diagnostic only; the decision was
      // already made atomically above.
      const draft = await db
        .prepare("SELECT consumed_at, expires_at, booking_id FROM chat_booking_drafts WHERE token = ?1")
        .bind(token)
        .first<{ consumed_at: number | null; expires_at: number; booking_id: string | null }>();
      if (!draft) {
        return Response.json({ error: "That confirmation is no longer valid. Ask the assistant to prepare it again." }, { status: 404 });
      }
      if (draft.consumed_at !== null) {
        if (draft.booking_id) {
          // Already confirmed and we can PROVE it -- there is a booking row.
          // Report success rather than an error that would make this guest
          // think their own double-tap failed and try again.
          return Response.json({ ok: true, alreadyConfirmed: true, bookingId: draft.booking_id });
        }

        // Consumed, but no booking_id. "Consumed" alone is NOT evidence a
        // booking exists, and reporting ok:true here was a lie the guest acts
        // on -- verified: sell the session out, confirm (409 "sold out"), then
        // press the card's re-enabled button again, and the old code answered
        // {ok:true, alreadyConfirmed:true, bookingId:null}. The card believed
        // it and said "Request sent -- our team will confirm shortly." while
        // zero bookings existed. A guest who is told that stops looking for a
        // seat and turns up at the river without one.
        //
        // Two distinct ways to land here, and they need opposite answers:
        //   - a sibling request claimed the draft milliseconds ago and is
        //     still inside createTourBooking -- a booking IS coming (this is
        //     the ordinary double-tap, and it is the common case);
        //   - an earlier attempt claimed the draft and then FAILED, so no
        //     booking will ever exist (the draft is deliberately not released
        //     -- whatever failed will fail again, and a reusable token invites
        //     a retry loop).
        // Only the booking row itself distinguishes them, so wait briefly for
        // it to appear rather than guessing.
        for (let attempt = 0; attempt < 4; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const settled = await db
            .prepare("SELECT booking_id FROM chat_booking_drafts WHERE token = ?1")
            .bind(token)
            .first<{ booking_id: string | null }>();
          if (settled?.booking_id) {
            return Response.json({ ok: true, alreadyConfirmed: true, bookingId: settled.booking_id });
          }
        }

        // No booking after ~1.2s: the earlier attempt failed. Say so. If we
        // are somehow wrong and one lands later, the guest is told to check
        // with staff -- a false "it didn't work" is recoverable (staff see the
        // pending booking), a false "it worked" is not.
        return Response.json(
          {
            error: `That request didn't go through -- ask the assistant to prepare it again, or message us on WhatsApp: https://wa.me/${WHATSAPP_NUMBER}`,
          },
          { status: 409 }
        );
      }
      return Response.json(
        { error: "That confirmation expired. Ask the assistant to prepare it again -- prices and availability may have changed." },
        { status: 410 }
      );
    }

    const draft = await db
      .prepare(
        `SELECT conversation_id, tour_session_id, adults, children, infants, pickup_zone_id
           FROM chat_booking_drafts WHERE token = ?1`
      )
      .bind(token)
      .first<{
        conversation_id: string; tour_session_id: string; adults: number;
        children: number; infants: number; pickup_zone_id: string | null;
      }>();
    if (!draft) {
      return Response.json({ error: "That confirmation is no longer valid." }, { status: 404 });
    }

    // The tour is re-derived from the SESSION, never from the draft or the
    // model -- same trust-anchor rule createTourBooking already enforces
    // internally (it rejects a tourId that disagrees with the session's).
    const session = await db
      .prepare("SELECT tour_id FROM tour_sessions WHERE id = ?1")
      .bind(draft.tour_session_id)
      .first<{ tour_id: string }>();
    if (!session) {
      return Response.json({ error: "That date is no longer available. Please start again." }, { status: 409 });
    }

    // Prices are recomputed inside createTourBooking from D1 -- nothing the
    // model produced influences what the guest is charged. The atomic capacity
    // guard in there is also the REAL availability check; everything before
    // this point was advisory.
    const result = await createTourBooking({
      tourSessionId: draft.tour_session_id,
      tourId: session.tour_id,
      adults: draft.adults,
      children: draft.children,
      infants: draft.infants,
      guestName: name,
      guestEmail: email || null,
      guestPhone: phone,
      pickupZoneId: draft.pickup_zone_id,
      hotel: null,
      addonChoice: null,
      promoCode: null,
      locale: "en",
      // Plan §9 gives the chatbot its own source so staff can see at a glance
      // which bookings the bot produced -- and audit them.
      source: "chatbot",
      bookedByAgentId: null,
      consentMarketing: false,
    });

    if (!result.success) {
      // The draft is already consumed. Deliberately NOT released: whatever
      // failed (the date sold out while they typed) will fail again, and a
      // reusable token invites a retry loop. The guest gets a fresh draft.
      const messages: Record<string, string> = {
        no_capacity: "Sorry -- that date just sold out while you were confirming. Ask the assistant for another date.",
        blocked: "That date isn't available any more. Ask the assistant for another date.",
        not_found: "That date is no longer available. Please start again.",
        invalid_input: "Please check the details and try again.",
      };
      return Response.json(
        { error: messages[result.reason ?? ""] ?? `Something went wrong -- please message us on WhatsApp: https://wa.me/${WHATSAPP_NUMBER}` },
        { status: 409 }
      );
    }

    // Link the draft to what it produced -- the audit trail from "the bot
    // proposed this" to "this booking exists".
    await db
      .prepare("UPDATE chat_booking_drafts SET booking_id = ?1 WHERE token = ?2")
      .bind(result.bookingId!, token)
      .run();

    // Unlike both public widgets, this path never sent a receipt: the guest
    // got no email and no self-service manage link for a real booking that
    // claimed a real seat -- manageToken was minted, returned in this route's
    // JSON, and then dropped, since ChatBookingCard only reads {ok, error}.
    // sendBookingAck never throws (see its own contract), so this can't turn
    // an already-successful booking into an error response -- same "awaited,
    // not fire-and-forget" reasoning as the other two booking paths: a Worker
    // can be torn down the instant this response returns.
    await sendBookingAck(result.bookingId!, request.headers.get("host"));

    // Plan §9: "post-confirm message says 'pending until staff confirms' +
    // receptionist WhatsApp". Written into the thread so it survives a reload
    // and staff see exactly what the guest was told.
    await appendMessage(
      draft.conversation_id,
      "bot",
      `Thanks ${name} -- I've sent your request to our team. It's **pending until our staff confirm it**; they'll be in touch shortly. Anything urgent: https://wa.me/${WHATSAPP_NUMBER}`
    );

    return Response.json({ ok: true, bookingId: result.bookingId, manageToken: result.manageToken });
  } catch (err) {
    console.error("chat confirm failed", err);
    return Response.json(
      { error: `Something went wrong -- please message us on WhatsApp: https://wa.me/${WHATSAPP_NUMBER}` },
      { status: 500 }
    );
  }
}
