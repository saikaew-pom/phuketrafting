import { getDb } from "@/lib/db";
import { listAvailableTourSessions } from "@/lib/scheduling";
import { calculateTourPrice } from "@/lib/pricing";
import { listTours } from "@/lib/queries/tours";
import { bangkokTodayISO } from "@/lib/format";
import type { AiTool } from "@/lib/ai";

/**
 * The chatbot's booking tools (plan §9's prepare -> card -> confirm).
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the model proposes, it never decides.
 * Every tool here treats the model's arguments as untrusted input -- the same
 * standing as a raw form post -- because they are. A guest can talk a model
 * into emitting almost anything, so "the model said the total is 10 baht" must
 * be incapable of making the total 10 baht.
 *
 * Concretely:
 *   - No tool inserts a booking, claims a seat, or moves money. The most a
 *     tool can do is write a 15-minute draft row.
 *   - Prices are NEVER accepted from the model and never stored on the draft.
 *     They are computed from D1 at prepare time (to show the guest) and
 *     recomputed at confirm time (to bind the booking).
 *   - Availability is never taken on the model's word -- prepare re-reads the
 *     session, and the real capacity claim happens inside createTourBooking's
 *     atomic guard at confirm.
 */

/** Plan §9: "AI tool writes only a 15-min draft token". */
const DRAFT_TTL_SECONDS = 15 * 60;

/** Mirrors the public widget's own bound (booking-actions.ts's Zod schema). */
const MAX_PER_BAND = 20;
const AVAILABILITY_WINDOW_DAYS = 90;

export const BOOKING_TOOLS: AiTool[] = [
  {
    name: "list_availability",
    description:
      "List real open dates for a tour. Use this before proposing any date -- you have no other source of availability. Returns only sessions that genuinely have seats.",
    input_schema: {
      type: "object",
      properties: {
        tour_id: { type: "string", description: "The tour id exactly as given in FACTS (e.g. tour-b1)." },
      },
      required: ["tour_id"],
    },
  },
  {
    name: "prepare_booking",
    description:
      "Prepare a booking for the guest to review and confirm. This does NOT book anything -- it shows the guest a card they must press Confirm on. Call it once the guest has chosen a tour, a date from list_availability, and guest numbers. Do NOT ask for their name, phone or email: the card collects those itself.",
    input_schema: {
      type: "object",
      properties: {
        tour_session_id: { type: "string", description: "A session id returned by list_availability." },
        adults: { type: "number", description: "Guests aged 6 and over." },
        children: { type: "number", description: "Guests aged 6 and over who are children; priced the same as adults." },
        infants: { type: "number", description: "Guests under 6. Free, and they do not take a seat." },
        pickup_zone_id: { type: "string", description: "Optional pickup zone id from FACTS. Omit if the guest is making their own way." },
      },
      // Deliberately ONLY the session and adults. Plan §9: "optional in the AI
      // tool schema -- required fields make the model invent placeholders". A
      // model faced with a required `phone` will cheerfully emit "0812345678"
      // rather than admit it doesn't know, and that fake number would ride
      // through to a real booking.
      required: ["tour_session_id", "adults"],
    },
  },
];

export interface ToolResult {
  /** JSON string handed back to the model as the tool result. */
  content: string;
  /** Set when a draft was created -- the route surfaces this to the widget. */
  draft?: DraftSummary;
}

export interface DraftSummary {
  token: string;
  tourName: string;
  date: string;
  startTime: string;
  adults: number;
  children: number;
  infants: number;
  pickupZoneName: string | null;
  /** Server-computed. The model never sees these as inputs, only as output. */
  total: number;
  depositAmount: number;
  balanceAmount: number;
  expiresAt: number;
}

function clampCount(value: unknown): number {
  // The model emits JSON numbers, but "2" or 2.5 or -1 or 999 are all things a
  // model will produce under pressure. Coerce and bound rather than trust.
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_PER_BAND);
}

async function runListAvailability(input: Record<string, unknown>): Promise<ToolResult> {
  const tourId = String(input.tour_id ?? "").trim();
  // The model can hallucinate a tour id. Resolve it against the real list
  // rather than querying with whatever string it produced.
  const tours = await listTours();
  const tour = tours.find((t) => t.id === tourId && t.is_active === 1);
  if (!tour) {
    return { content: JSON.stringify({ error: `No active tour with id "${tourId}". Use an id from FACTS.` }) };
  }

  // Bangkok-today, matching the chat grounding and the public availability
  // floor -- a bare UTC "today" would offer a departure dated local-yesterday
  // between 00:00-07:00 Thailand time. (Audit A7 sibling.)
  const today = bangkokTodayISO();
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + AVAILABILITY_WINDOW_DAYS);
  const sessions = await listAvailableTourSessions(tour.id, today, until.toISOString().slice(0, 10));

  return {
    content: JSON.stringify({
      tour: tour.name,
      // Capped: the model doesn't need 90 days of rows, and every one is input
      // tokens on the next turn.
      sessions: sessions.slice(0, 12).map((s) => ({
        tour_session_id: s.id,
        date: s.date,
        start_time: s.start_time,
        seats_left: s.capacity - s.allotment_hold - s.booked_count,
      })),
    }),
  };
}

async function runPrepareBooking(input: Record<string, unknown>, conversationId: string): Promise<ToolResult> {
  const db = getDb();
  const tourSessionId = String(input.tour_session_id ?? "").trim();

  // Re-read the session. This is the trust anchor: everything below derives
  // from the real row, never from the model's other arguments.
  const session = await db
    .prepare(
      `SELECT ts.id, ts.tour_id, ts.date, ts.start_time, ts.capacity, ts.booked_count, ts.allotment_hold, ts.is_blocked, t.name AS tour_name
         FROM tour_sessions ts JOIN tours t ON ts.tour_id = t.id
        WHERE ts.id = ?1`
    )
    .bind(tourSessionId)
    .first<{
      id: string; tour_id: string; date: string; start_time: string;
      capacity: number; booked_count: number; allotment_hold: number; is_blocked: number; tour_name: string;
    }>();
  if (!session) {
    return { content: JSON.stringify({ error: "That date isn't one of ours. Call list_availability and use an id from it." }) };
  }
  if (session.is_blocked) {
    return { content: JSON.stringify({ error: "That date is blocked and cannot be booked. Offer the guest another date." }) };
  }

  const adults = clampCount(input.adults);
  const children = clampCount(input.children);
  const infants = clampCount(input.infants);
  if (adults + children + infants <= 0) {
    return { content: JSON.stringify({ error: "Need at least one guest. Ask how many people are coming." }) };
  }

  // Advisory only -- the REAL capacity check is the atomic guard inside
  // createTourBooking at confirm time. This just avoids showing a card that
  // is already doomed.
  const seatsLeft = session.capacity - session.allotment_hold - session.booked_count;
  if (adults + children > seatsLeft) {
    return {
      content: JSON.stringify({ error: `Only ${seatsLeft} seat(s) left on that date. Offer another date or a smaller group.` }),
    };
  }

  // A pickup zone the model invented would silently become "no pickup", so
  // resolve it and say so rather than quietly dropping it.
  let pickupZoneId: string | null = null;
  let pickupZoneName: string | null = null;
  const requestedZone = input.pickup_zone_id ? String(input.pickup_zone_id).trim() : "";
  if (requestedZone) {
    const zone = await db
      .prepare("SELECT id, name FROM pickup_zones WHERE id = ?1 AND is_active = 1")
      .bind(requestedZone)
      .first<{ id: string; name: string }>();
    if (!zone) {
      return { content: JSON.stringify({ error: `No pickup zone "${requestedZone}". Use one from FACTS or omit it.` }) };
    }
    pickupZoneId = zone.id;
    pickupZoneName = zone.name;
  }

  // THE price, computed here from D1 -- the model contributes nothing to it.
  // Recomputed again at confirm, so even this number is only for display.
  const price = await calculateTourPrice({
    tourId: session.tour_id,
    date: session.date,
    bookingDate: bangkokTodayISO(), // (Audit A7 sibling — match createTourBooking's promo date)
    adults,
    children,
    infants,
    pickupZoneId,
    promoCode: null, // The bot never applies promos -- see the system prompt.
  });

  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + DRAFT_TTL_SECONDS;

  // Plan §9's "one draft slot", enforced by a partial unique index. Retire any
  // live draft first so a new proposal replaces the old rather than colliding.
  await db.batch([
    db
      .prepare("UPDATE chat_booking_drafts SET consumed_at = unixepoch() WHERE conversation_id = ?1 AND consumed_at IS NULL")
      .bind(conversationId),
    db
      .prepare(
        `INSERT INTO chat_booking_drafts (token, conversation_id, tour_session_id, adults, children, infants, pickup_zone_id, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(token, conversationId, session.id, adults, children, infants, pickupZoneId, expiresAt),
  ]);

  const draft: DraftSummary = {
    token,
    tourName: session.tour_name,
    date: session.date,
    startTime: session.start_time,
    adults,
    children,
    infants,
    pickupZoneName,
    total: price.total,
    depositAmount: price.depositAmount,
    balanceAmount: price.balanceAmount,
    expiresAt,
  };

  return {
    // What the model is told. Deliberately terse and instructive: it must not
    // restate the price (the card already shows it, authoritatively) and must
    // not claim the booking exists.
    content: JSON.stringify({
      ok: true,
      shown_to_guest: "A confirmation card is now displayed with the full details and price.",
      instruction:
        "Tell the guest to check the card and press Confirm. Do NOT repeat the price or claim anything is booked. Nothing is reserved until they confirm and our staff approve.",
    }),
    draft,
  };
}

export async function runBookingTool(
  name: string,
  input: unknown,
  conversationId: string
): Promise<ToolResult> {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "list_availability":
      return runListAvailability(args);
    case "prepare_booking":
      return runPrepareBooking(args, conversationId);
    default:
      // A model can hallucinate a tool name; say so rather than throw.
      return { content: JSON.stringify({ error: `Unknown tool "${name}".` }) };
  }
}
