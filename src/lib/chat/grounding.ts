import { listTours, getTourRates } from "@/lib/queries/tours";
import { listPickupZones } from "@/lib/queries/pickup";
import { listCampZones } from "@/lib/queries/camping";
import { getPaymentPolicy } from "@/lib/queries/settings";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";

/**
 * Builds the system prompt from LIVE D1 data.
 *
 * The whole point is that the model never answers a factual question from its
 * own weights. Every price, duration and pickup fee below is read from the
 * same tables the website renders from, so the bot cannot quote a price the
 * site contradicts -- plan §9: "Info mode first (tours, prices, pickup,
 * safety, weather -- grounded in DB)". A model left to recall "roughly 3000
 * baht" will confidently invent numbers, and a guest quoted the wrong price is
 * a real dispute at the riverside.
 *
 * Deliberately NOT cached: staff can edit a price in the dashboard at any
 * moment (that is the entire point of Phase 2's CRUD), and a bot quoting a
 * stale cached price is exactly the failure this grounding exists to prevent.
 * It's a handful of indexed reads on a request that's about to spend far more
 * on tokens anyway.
 */

/** Asia/Bangkok, matching where the trips actually run. */
function todayInThailand(now: Date): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function safeParseIncludes(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // `includes` is TEXT with no CHECK -- a hand-edited row can hold anything.
    // A broken row must not take down the chatbot.
    return [];
  }
}

export async function buildSystemPrompt(now: Date = new Date()): Promise<string> {
  const [tours, pickupZones, campZones, policy] = await Promise.all([
    listTours(),
    listPickupZones(),
    listCampZones(),
    getPaymentPolicy(),
  ]);

  const activeTours = tours.filter((t) => t.is_active === 1);
  const tourLines = await Promise.all(
    activeTours.map(async (t) => {
      const rates = await getTourRates(t.id);
      const priced = rates
        .filter((r) => r.price > 0)
        .map((r) => `${r.label ?? `age ${r.min_age}+`} THB ${r.price}`)
        .join(", ");
      const free = rates.filter((r) => r.price === 0).map((r) => r.label ?? `under ${r.min_age + 1}`);
      return [
        `- ${t.name}${t.tagline ? ` (${t.tagline})` : ""}`,
        `  price: ${priced || "ask staff"}${free.length ? ` | free: ${free.join(", ")}` : ""}`,
        `  ${[t.distance_km ? `${t.distance_km} km` : null, t.duration_label].filter(Boolean).join(', ') || 'details on request'}`,
        `  includes: ${safeParseIncludes(t.includes).join(", ") || "ask staff"}`,
        `  group size: ${t.min_group ?? "?"}-${t.max_group ?? "?"}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
  );

  // listPickupZones already filters is_active at the query, so no filter here.
  const pickupLines = pickupZones
    .map((z) => `- ${z.name}: ${z.fee > 0 ? `THB ${z.fee}` : "free"}${z.earliest_pickup_time ? `, from ${z.earliest_pickup_time}` : ""}`);

  const campLines = campZones
    .filter((z) => z.is_active === 1)
    .map((z) => `- ${z.name}${z.sleeps_label ? ` (${z.sleeps_label})` : ""}`);

  const paymentLine =
    policy.mode === "deposit"
      ? `Guests pay a ${Math.round(policy.depositRate * 100)}% deposit online to reserve; the balance is paid on the day.`
      : policy.mode === "full_prepay"
        ? "Guests pay in full online to reserve."
        : "No payment is taken online; guests pay on the day.";

  return `You are the booking assistant for Phuket Rafting (Le Rafting & ATV), a white-water rafting, zipline and ATV operator in Phang Nga, Thailand, family-run since 2002.

TODAY IS ${todayInThailand(now)} (Asia/Bangkok, UTC+7). All dates you mention are Thailand time.

## Absolute rules
1. EVERY fact you state about prices, tours, pickup or camping MUST come from the FACTS section below. It is read live from our database and is the only truth.
2. If something is not in FACTS, say you don't know and offer WhatsApp (https://wa.me/${WHATSAPP_NUMBER}). NEVER guess, estimate, or say "around" / "typically" about a price, time or capacity.
3. Never invent a discount, a promotion, or an availability claim. You do not know what dates are open -- staff or the booking form do.
4. Never make safety or medical judgements ("you'll be fine", "that's safe for your back"). Rafting is a real outdoor activity: if a guest raises a health condition, pregnancy, a young child, or a safety worry, tell them our team will advise and point them to WhatsApp.
5. Never claim a booking is confirmed. You cannot confirm bookings. Staff confirm every booking by hand.
6. If a guest asks about weather or river conditions on a date, say conditions are assessed on the day and we cancel or reschedule for safety -- with a full refund or free reschedule -- rather than predicting.
7. Answer in the guest's language.

## Style
Short, warm, concrete. Two or three sentences unless asked for detail, and NEVER more than about 150 words. There is a hard limit on how long one reply can be, and going past it gets you cut off mid-sentence -- so if a guest asks for "everything" or a full list, give the few most relevant facts and offer to go deeper on whichever one they pick, rather than dumping the whole FACTS section. Plain sentences and simple dashes for lists: no headings, no bold, no emoji. State real numbers from FACTS rather than describing them vaguely.

## FACTS (live from our database)

### Tours
${tourLines.join("\n") || "(none configured)"}

### Pickup zones
${pickupLines.join("\n") || "(none configured)"}

### Camping zones
${campLines.join("\n") || "(none configured)"}

### Payment
${paymentLine}
Free cancellation or reschedule up to ${policy.cancellationWindowHours} hours before departure. If we cancel for weather or safety, guests always get a full refund or a free reschedule.

### Contact
WhatsApp: https://wa.me/${WHATSAPP_NUMBER}`;
}
