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
// Per IP. Tighter than the enquiry form's 3/60s is unnecessary, but a chat is
// inherently many requests, so this is per-message rather than per-session.
const RATE_LIMIT_PER_MIN = 12;
// A real guest asking about tours does not need 40 turns. Past this the thread
// is either a bot or someone who needs a human anyway.
const MAX_GUEST_MESSAGES_PER_SESSION = 30;
// Every past message is re-sent as input tokens on EVERY turn, so this is the
// single biggest lever on per-reply cost.
const HISTORY_WINDOW = 12;
// Bounds one message's input tokens. Zod enforces it server-side; the widget's
// maxLength is only advisory.
const MAX_INPUT_CHARS = 1000;

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
  const allowed = await checkRateLimit(`chat:${cfIp ?? "no-cf-ip"}`, RATE_LIMIT_PER_MIN, 60);
  if (!allowed) {
    return Response.json({ error: "You're sending messages very quickly -- please wait a moment." }, { status: 429 });
  }

  try {
    // sessionId is client-supplied, so it identifies a thread but authorizes
    // nothing: a guessed id can only reach another guest's CHAT thread, which
    // is why nothing sensitive is ever stored here and why the bot is
    // stateless about identity. Booking mode (6d) must NOT relax this -- its
    // draft token, not this id, is what will carry authority.
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
    const system = await buildSystemPrompt();

    const reply = await aiComplete(
      {
        system,
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

    const text = finalizeReply(reply.text, reply.stopReason);
    await appendMessage(conversation.id, "bot", text);

    // Per plan §9's "model/token usage logged per conversation" -- the
    // dashboard's spend view (6b) reads this.
    console.log(
      `chat ${conversation.id}: in=${reply.inputTokens} out=${reply.outputTokens} stop=${reply.stopReason}`
    );

    return Response.json({ reply: text });
  } catch (err) {
    // Degrade, never 500 at a guest: plan §8 requires these fail open. The
    // guest's message is already recorded above, so staff can still pick it up.
    console.error("chat failed", err);
    return Response.json({ reply: FALLBACK, degraded: true });
  }
}
