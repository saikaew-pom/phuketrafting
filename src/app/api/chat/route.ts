import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { aiComplete } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/chat/grounding";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  findOrCreateConversation,
  appendMessage,
  listRecentMessages,
  countGuestMessages,
} from "@/lib/queries/conversations";
import { getChatPolicy } from "@/lib/queries/settings";
import { BOOKING_TOOLS, runBookingTool, type DraftSummary } from "@/lib/chat/booking-tools";
import type { AiMessage } from "@/lib/ai";
import { getChatSpend, addChatTokens } from "@/lib/queries/chat-spend";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";

/**
 * The public chatbot endpoint (plan §9, info mode).
 *
 * A route handler rather than a Server Action because the widget will stream/
 * poll it and it's a genuine JSON API, but the security posture is identical:
 * unauthenticated, directly POST-reachable, and it SPENDS MONEY per call
 * (MiniMax bills per token). That last part makes rate limiting a cost control,
 * not just an abuse control -- an unmetered endpoint here is a bill, not a
 * nuisance.
 */
export const dynamic = "force-dynamic";

/**
 * Cost/abuse limits (plan §9's "Chatbot cost & abuse control"). Every one of
 * these is a spend ceiling first and a UX rule second.
 */
// Per IP -- the bucket an abuser cannot reset, so it carries the real ceiling.
// Raised above the per-session limit because a shared hotel wifi legitimately
// carries several guests at once.
const RATE_LIMIT_PER_IP_PER_MIN = 30;
// Per session -- generous for one human (a person types maybe 3-4 messages a
// minute), so it never throttles a real guest behind a shared IP.
const RATE_LIMIT_PER_SESSION_PER_MIN = 8;
// A real guest asking about tours does not need 40 turns. Past this the thread
// is either a bot or someone who needs a human anyway.
const MAX_GUEST_MESSAGES_PER_SESSION = 30;
// Every past message is re-sent as input tokens on EVERY turn, so this is the
// single biggest lever on per-reply cost.
const HISTORY_WINDOW = 12;
// Bounds one message's input tokens. Zod enforces it server-side; the widget's
// maxLength is only advisory.
const MAX_INPUT_CHARS = 1000;
// The booking flow needs 2 (list_availability -> prepare_booking); 4 leaves
// room for a correction ("actually make it 3 people") without letting a
// confused model bill us indefinitely.
const MAX_TOOL_ROUNDS = 4;

const ChatSchema = z.object({
  sessionId: z.string().trim().uuid("Invalid session"),
  message: z.string().trim().min(1, "Say something first.").max(MAX_INPUT_CHARS),
});

/** The graceful degrade plan §9 asks for, rather than an error. */
const FALLBACK = `Sorry -- I can't answer right now. Please message us on WhatsApp: https://wa.me/${WHATSAPP_NUMBER}`;

/**
 * Appended when the model ran out of max_tokens mid-answer. English even on a
 * Thai reply, which is slightly jarring -- but this is the rare safety net,
 * not the main path (the system prompt's length rule is what keeps replies
 * inside the budget), and the wa.me link is the part that has to survive.
 */
const TRUNCATED_SUFFIX = `\n\n(There's more than fits in one message -- ask me about a specific tour, or message our team: https://wa.me/${WHATSAPP_NUMBER})`;

/**
 * M2 is a REASONING model: thinking blocks spend the same max_tokens budget as
 * the answer, so a long grounded reply can hit the ceiling and stop MID-WORD.
 * Verified live before this guard existed: an "exhaustive list, in Thai"
 * question returned stop_reason='max_tokens' at out=1500, cut inside a Thai
 * word, and that fragment was shown to the guest AND stored as the bot's turn
 * (poisoning the next turn's history). Two distinct failures the caller must
 * separate:
 *   - text === ''   -> only thinking fit. There is no answer; use the fallback.
 *   - stop_reason='max_tokens' with text -> a real but half-finished answer.
 *     Cut back to the last sentence the model actually completed and say
 *     plainly that there's more, rather than passing a fragment off as whole.
 */
function finalizeReply(text: string, stopReason: string | null): string {
  if (!text) return FALLBACK;
  if (stopReason !== "max_tokens") return text;
  return trimToLastCompleteSentence(text) + TRUNCATED_SUFFIX;
}

function trimToLastCompleteSentence(text: string): string {
  // Thai doesn't end sentences with punctuation, so a newline -- the model's
  // own paragraph/list break -- counts as a boundary too.
  const cut = Math.max(...[".", "!", "?", "。", "\n"].map((p) => text.lastIndexOf(p)));
  // Only trim if a boundary exists in the back half; otherwise we'd throw away
  // most of a legitimate answer chasing a clean cut.
  return cut > text.length / 2 ? text.slice(0, cut + 1).trim() : text.trim();
}

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { sessionId, message } = parsed.data;

  // cf-connecting-ip is set by Cloudflare's edge and cannot be spoofed --
  // same reasoning as enquiry-actions.ts. The rate-limit bucket is a real
  // spend boundary, so it never trusts a forgeable header.
  const cfIp = request.headers.get("cf-connecting-ip");
  // TWO buckets, deliberately. Neither alone is sufficient:
  //   - per-IP is the only bucket an abuser can't reset (they can rotate
  //     sessionId freely), but it collectively punishes a shared hotel/cafe
  //     wifi -- very plausible here, since guests book from a hotel lobby.
  //   - per-session is generous per person, so one guest on that shared wifi
  //     isn't throttled by strangers, but it is trivially bypassed alone.
  // Together: a normal guest is bounded by the loose per-session limit, while
  // the per-IP ceiling still caps what any single origin can spend.
  const [ipOk, sessionOk] = await Promise.all([
    checkRateLimit(`chat-ip:${cfIp ?? "no-cf-ip"}`, RATE_LIMIT_PER_IP_PER_MIN, 60),
    checkRateLimit(`chat-session:${sessionId}`, RATE_LIMIT_PER_SESSION_PER_MIN, 60),
  ]);
  if (!ipOk || !sessionOk) {
    return Response.json({ error: "You're sending messages very quickly -- please wait a moment." }, { status: 429 });
  }

  // Declared OUT here, not inside the try, so the finally can still bill what
  // was actually spent when a later round throws. aiComplete throws on an API
  // failure or timeout, and the multi-round booking flow is exactly where that
  // is most likely (more calls, longer calls) -- so the old shape leaked
  // precisely the turns that cost the most: round 1's tokens were real money
  // MiniMax had already billed, and the outer catch dropped them on the floor.
  // Since the daily cap is the only thing standing between a runaway model and
  // the bill, spend that never gets recorded is spend the cap cannot see.
  let totalIn = 0;
  let totalOut = 0;

  try {
    // sessionId is client-supplied, so it identifies a thread but authorizes
    // nothing: a guessed id can only reach another guest's CHAT thread, which
    // is why nothing sensitive is ever stored here and why the bot is
    // stateless about identity. Booking mode (6d) must NOT relax this -- its
    // draft token, not this id, is what will carry authority.
    // Both read BEFORE any model call: the whole point is to not spend.
    const [policy, spend] = await Promise.all([getChatPolicy(), getChatSpend()]);

    if (!policy.enabled) {
      return Response.json({ reply: FALLBACK, degraded: true });
    }

    // Plan §9: "when hit, the bot degrades gracefully to 'please WhatsApp us'
    // instead of erroring". Checked before the call, not after -- a cap that
    // only notices once the tokens are spent isn't a cap. It can overshoot by
    // at most the in-flight turns at the boundary, which is the same
    // acceptable trade as the promo-code cap in booking.ts.
    if (spend.tokens >= policy.dailyTokenCap) {
      console.warn(`chat: daily token cap reached (${spend.tokens}/${policy.dailyTokenCap}) -- degrading to WhatsApp`);
      return Response.json({ reply: FALLBACK, degraded: true, capReached: true });
    }

    const conversation = await findOrCreateConversation("web", sessionId);

    // A thread staff have taken over must not get bot replies talking over
    // them -- plan §9: "bot pauses while staff owns the thread". The guest's
    // message is still recorded so staff see it.
    if (conversation.status === "staff") {
      await appendMessage(conversation.id, "guest", message);
      return Response.json({ reply: null, staffHandling: true });
    }

    const guestTurns = await countGuestMessages(conversation.id);
    if (guestTurns >= MAX_GUEST_MESSAGES_PER_SESSION) {
      return Response.json({
        reply: `We've been chatting a while -- our team can help you better from here: https://wa.me/${WHATSAPP_NUMBER}`,
        capped: true,
      });
    }

    // Recorded BEFORE the model call: if MiniMax times out, the guest's
    // question is still in the thread for staff to answer. Losing what the
    // guest said because our vendor was slow is the worse failure.
    await appendMessage(conversation.id, "guest", message);

    const history = await listRecentMessages(conversation.id, HISTORY_WINDOW);
    const system = await buildSystemPrompt(new Date(), policy.bookingMode);

    // Tools only exist when booking mode is on (plan §9: booking mode behind
    // its own toggle). With it off the model literally cannot propose a
    // booking -- there's no tool to call -- rather than being merely asked not
    // to, which a prompt can't guarantee.
    const tools = policy.bookingMode ? BOOKING_TOOLS : undefined;

    const reply = await aiComplete(
      {
        system,
        tools,
        // 'staff' turns are folded in as assistant text: from the guest's
        // side a human takeover reads as the same conversation, and the model
        // needs that context to not repeat what staff already said.
        messages: history.map((m) => ({
          role: m.sender === "guest" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        })),
      },
      env
    );

    // Not configured -- treated as a normal state, same contract as
    // brevo/payments. The widget simply shows the WhatsApp fallback.
    if (!reply) {
      return Response.json({ reply: FALLBACK, degraded: true });
    }

    // The tool loop.
    //
    // BOUNDED, not single-round. The natural booking flow is genuinely two
    // calls -- list_availability to find real dates, THEN prepare_booking --
    // and a single round left the model mid-sequence with no text at all, so
    // the guest silently got the WhatsApp fallback instead of a booking card
    // (observed live before this was a loop).
    //
    // But it is NOT an open-ended agent loop either: every round is another
    // billed call, and a model that keeps calling tools forever is a runaway
    // bill. MAX_TOOL_ROUNDS caps it; hitting the cap is a bug worth seeing in
    // the logs, not something to paper over.
    let draft: DraftSummary | undefined;
    let finalReply = reply;
    totalIn = reply.inputTokens;
    totalOut = reply.outputTokens;

    // Grows as the model and tools take turns. Seeded with the real history.
    const convo: AiMessage[] = history.map((m) => ({
      role: m.sender === "guest" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS && finalReply.toolCalls.length > 0; round++) {
      const results = await Promise.all(
        finalReply.toolCalls.map(async (call) => {
          const out = await runBookingTool(call.name, call.input, conversation.id);
          // Last one wins: a second prepare_booking in the same turn retires
          // the first server-side anyway (one draft slot), so the newest draft
          // is the only one whose token still works.
          if (out.draft) draft = out.draft;
          return { call, out };
        })
      );

      // The assistant's tool_use turn must be replayed VERBATIM -- a
      // tool_result has to attach to the exact tool_use block that asked for
      // it, so this can't be reconstructed from text.
      convo.push({ role: "assistant", content: finalReply.raw });
      convo.push({
        role: "user",
        content: results.map(({ call, out }) => ({
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: out.content,
        })),
      });

      const next = await aiComplete({ system, tools, messages: convo }, env);
      if (!next) break;
      finalReply = next;
      totalIn += next.inputTokens;
      totalOut += next.outputTokens;
    }

    if (finalReply.toolCalls.length > 0) {
      // Still asking for tools after the cap. finalizeReply will fall back to
      // WhatsApp (there's no text), which is the right guest outcome -- but
      // log it loudly, because it means the model is stuck in a loop and
      // every round of it was billed.
      console.error(`chat: model still calling tools after ${MAX_TOOL_ROUNDS} rounds -- giving up`);
    }

    const text = finalizeReply(finalReply.text, finalReply.stopReason);
    await appendMessage(conversation.id, "bot", text);

    // Per plan §9's "model/token usage logged per conversation".
    console.log(
      `chat ${conversation.id}: in=${totalIn} out=${totalOut} stop=${finalReply.stopReason}${draft ? " DRAFT" : ""}`
    );

    // `draft` is what makes the review card appear. It carries only
    // server-computed values (see booking-tools.ts) -- the model never
    // supplies a price.
    return Response.json({ reply: text, draft });
  } catch (err) {
    // Degrade, never 500 at a guest: plan §8 requires these fail open. The
    // guest's message is already recorded above, so staff can still pick it up.
    console.error("chat failed", err);
    return Response.json({ reply: FALLBACK, degraded: true });
  } finally {
    // Recorded from the model's own reported usage rather than an estimate --
    // these are the tokens actually billed. In a `finally` so a throw part-way
    // through the tool loop still bills the rounds that already completed:
    // MiniMax charged for them whether or not round 3 timed out.
    //
    // Never throws into the guest's reply: losing one turn's accounting is far
    // better than failing a reply the guest already paid for in latency. The
    // cap self-heals on the next turn.
    if (totalIn + totalOut > 0) {
      try {
        await addChatTokens(totalIn + totalOut);
      } catch (err) {
        console.error("chat: failed to record token spend", err);
      }
    }
  }
}
