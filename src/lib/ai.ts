import Anthropic from "@anthropic-ai/sdk";

/**
 * The single interface the rest of the app talks to for AI -- same
 * one-module-owns-the-vendor stance as lib/payments.ts. Nothing outside this
 * file imports the SDK, so the provider stays swappable.
 *
 * MiniMax speaks Anthropic's /v1/messages wire format at its own baseURL
 * (plan §1a: "Anthropic-compatible SDK with baseURL override"), so the
 * official SDK works unmodified.
 */

export interface AiConfig {
  MINIMAX_API_KEY?: string;
  MINIMAX_BASE_URL?: string;
}

/**
 * MiniMax's Anthropic-compatible endpoint, if the env doesn't say otherwise.
 *
 * Not a secret -- it's the same public URL in every environment -- but it IS
 * required, and it was empty in .dev.vars until this chunk. A default here
 * means a missing var degrades to "works" rather than to a confusing 404 from
 * `undefined` being used as a base URL.
 */
const DEFAULT_BASE_URL = "https://api.minimax.io/anthropic";

/**
 * MiniMax-M2 is a REASONING model: every response begins with one or more
 * `thinking` blocks and only then emits `text`. Two consequences this file
 * exists to absorb:
 *   1. max_tokens must budget for the thinking, not just the answer. Verified
 *      live: max_tokens=32 on "reply PONG" returned ONE thinking block, zero
 *      text, and stop_reason='max_tokens' -- i.e. a silent empty answer that
 *      looks exactly like a broken integration.
 *   2. Callers must never concatenate all blocks blindly -- that would leak
 *      the model's private reasoning to a guest.
 */
export const AI_MODEL = "MiniMax-M2";

/**
 * Plan §8: "All server-side, all with hard Promise.race timeouts (40-60s)
 * failing open". A guest waiting on a hung model is worse than a guest told
 * to use WhatsApp.
 */
const AI_TIMEOUT_MS = 45_000;

/**
 * Ceiling for the per-request override below. Cloudflare's edge closes a
 * proxied HTTP request that hasn't responded within ~100s (a 524), so a
 * server action that waits longer than that fails as an opaque gateway error
 * instead of our own "took too long" message -- the override is clamped here
 * rather than trusted, so no caller can accidentally ask for that.
 */
const AI_TIMEOUT_MAX_MS = 90_000;

function getClient(config: AiConfig): Anthropic | null {
  const apiKey = config.MINIMAX_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({
    apiKey,
    baseURL: config.MINIMAX_BASE_URL || DEFAULT_BASE_URL,
    // The SDK's own retries are off: this call is awaited inside a guest's
    // chat request, and the Promise.race below is the real deadline. Leaving
    // retries on would let the SDK burn the whole budget re-sending a prompt
    // MiniMax already charged us for -- the same reasoning as payments.ts's
    // trimmed timeout/retry settings, but stricter because tokens cost money
    // per attempt.
    maxRetries: 0,
  });
}

/**
 * Extracts ONLY the guest-safe text blocks.
 *
 * Deliberately drops `thinking` blocks. They are the model's private
 * reasoning -- rendering them to a guest would leak how the bot decides
 * things, and on a booking flow that's a live prompt-injection aid. Also
 * drops tool_use blocks, which are for the caller to act on, not to show.
 */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export type AiToolCall = { id: string; name: string; input: unknown };

/** Re-exported so tool definitions and the tool loop don't import the SDK. */
export type AiTool = Anthropic.Tool;
export type AiMessage = Anthropic.MessageParam;

export function extractToolCalls(content: Anthropic.ContentBlock[]): AiToolCall[] {
  return content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

export interface AiReply {
  text: string;
  toolCalls: AiToolCall[];
  /**
   * The model's own content blocks, verbatim.
   *
   * Needed to replay the assistant's tool_use turn back to it: a tool_result
   * must attach to the exact tool_use block that requested it, so the turn
   * cannot be reconstructed from `text` alone. Callers pass this straight back
   * as an assistant message and never render it -- it still contains thinking
   * blocks, which extractText exists to keep away from guests.
   */
  raw: Anthropic.ContentBlock[];
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface AiRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  /** Budget the thinking, not just the answer -- see AI_MODEL's comment. */
  maxTokens?: number;
  /**
   * Hard deadline for this one call, defaulting to AI_TIMEOUT_MS and clamped
   * to AI_TIMEOUT_MAX_MS.
   *
   * Only for STAFF-facing batch generations that legitimately produce
   * thousands of tokens (the homepage translation batch is ~40 marketing
   * fields), where the 45s guest-facing deadline is shorter than the response
   * can physically take: no reasoning model emits a multi-thousand-token
   * answer plus its thinking in 45s, so such a call times out every time
   * regardless of how large max_tokens is. Guest-facing paths (chat) must
   * keep the default -- a visitor should never wait this long.
   */
  timeoutMs?: number;
}

/**
 * One model turn. Returns null when AI isn't configured, so callers treat
 * "no chatbot" as a normal state (same contract as brevo/payments).
 *
 * THROWS on a real API failure or a timeout -- the caller decides what the
 * guest sees. It must not invent a reply: a chatbot that silently answers
 * "sorry, something went wrong" as if the model said it is indistinguishable
 * from the model actually saying that.
 */
/**
 * Guards a staff-facing (not guest-facing) AI generation: THROWS on a real API
 * failure or a cut-off response, rather than degrading. A guest chatbot must
 * always show something; this instead fills a form field a human is about to
 * review, so a clear "try again" beats silently saving a response that
 * stopped mid-sentence or came back empty (MiniMax-M2's silent-empty-answer
 * failure mode -- see AI_MODEL's comment above). Shared by every one-shot
 * staff-AI feature (blog draft/excerpt, gallery captions, ...) so the same
 * two failure messages can't drift between them.
 */
export function requireCompleteText(text: string, stopReason: string | null): string {
  if (stopReason === "max_tokens") {
    throw new Error("The AI response was cut off before finishing. Try again, or shorten the input.");
  }
  if (!text) {
    throw new Error("The AI didn't return any text. Try again.");
  }
  return text;
}

/**
 * Turns an error thrown by aiComplete/requireCompleteText into a message
 * safe to show a human -- never the raw vendor payload.
 *
 * Confirmed live (gallery "Suggest caption", real 429 from a MiniMax
 * account at its quota): an Anthropic SDK APIError's `.message` is the
 * ENTIRE HTTP response body serialized as text, e.g. `429
 * {"type":"error","error":{"type":"rate_limit_error","message":"Token Plan
 * usage limit reached...(2056)"},"request_id":"06ac..."}`. Every staff-AI
 * action catches with `err instanceof Error ? err.message : ...` (this
 * file's requireCompleteText doc references that shape), which was passing
 * that raw blob straight into the dashboard's error UI unredacted.
 *
 * requireCompleteText's own thrown Errors ("cut off", "no text") and
 * aiComplete's Promise.race timeout Error are already human-authored
 * one-liners, not vendor payloads, so they pass through unchanged --
 * only a real APIError (HTTP failure from the SDK) gets rewritten.
 */
export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    return err.status === 429
      ? "The AI is temporarily out of quota. Try again shortly, or ask an admin to check the MiniMax plan."
      : "The AI service returned an error. Try again in a moment.";
  }
  return err instanceof Error ? err.message : "AI generation failed.";
}

export async function aiComplete(request: AiRequest, config: AiConfig): Promise<AiReply | null> {
  const client = getClient(config);
  if (!client) return null;

  const timeoutMs = Math.min(request.timeoutMs ?? AI_TIMEOUT_MS, AI_TIMEOUT_MAX_MS);

  // A real AbortController, not just a Promise.race abandoning the call: the
  // race alone let our side move on while the underlying fetch kept running
  // to completion. MiniMax finished the generation and billed it regardless,
  // but the catch below never sees a usage object, so addChatTokens is never
  // called for that round -- the daily spend cap is driven entirely by what
  // it records, so sustained timeouts (the exact symptom of the degraded
  // upstream that caused the previous account-wide 429) let real spend accrue
  // while the counter stays flat and the cap never bites. Same pattern
  // brevo.ts already uses for its own timeout. Promise.race stays as the
  // outer belt-and-braces per plan §8's "hard ceiling regardless of what the
  // client library does" -- an aborted signal that the SDK somehow doesn't
  // honor (a hung DNS lookup before the request is even issued) still can't
  // block past timeoutMs.
  const controller = new AbortController();
  const call = client.messages.create(
    {
      model: AI_MODEL,
      max_tokens: request.maxTokens ?? 1500,
      system: request.system,
      messages: request.messages,
      ...(request.tools?.length ? { tools: request.tools } : {}),
    },
    { signal: controller.signal }
  );

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      controller.abort();
      reject(new Error(`AI request exceeded ${timeoutMs}ms`));
    }, timeoutMs)
  );

  const message = await Promise.race([call, timeout]);

  return {
    text: extractText(message.content),
    toolCalls: extractToolCalls(message.content),
    raw: message.content,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    stopReason: message.stop_reason,
  };
}
