import { aiComplete, requireCompleteText, type AiConfig } from "@/lib/ai";
import { CHROME_STRINGS } from "@/lib/chrome-strings";
import { BUSINESS_NAME } from "@/lib/site";
import type { Locale } from "@/lib/i18n";

/**
 * "Generate" buttons on the dashboard translations screen (dashboard/
 * translations/actions.ts). One MiniMax call translates the WHOLE chrome
 * dictionary for a locale at once (~22 short strings in, ~22 out) rather than
 * one call per string -- the staff-ai rate-limit bucket (20/min, shared with
 * every other staff-AI feature) is sized around one-call-per-click UX, not a
 * loop of dozens of calls, and a single batched call is also just cheaper.
 */

const LOCALE_NAMES: Partial<Record<Locale, string>> = {
  th: "Thai",
  ru: "Russian",
  zh: "Simplified Chinese",
};

const SHARED_RULES = `Hard rules:
- Never translate business names, brand names, or place names (e.g. "Phuket Rafting", "Phang Nga") -- keep them exactly as given.
- Any "{token}" placeholder (e.g. "{rating}", "{travelerCount}") must appear in your translation EXACTLY as written, untranslated, in a natural position for the target language's grammar.
- Never invent, drop, or "improve" a fact -- especially a price, a duration, a year, or a rating. Translate what is there.
- Return valid JSON only.`;

const CHROME_SYSTEM = `You translate short user-interface text for ${BUSINESS_NAME}'s website (navigation links, buttons, footer labels) from English into the target language.

You are given a JSON object mapping short keys to English UI text. Return ONLY a JSON object with the exact same keys, each value replaced by its translation -- no other keys, no missing keys, no explanation, no markdown code fence.

- Keep translations SHORT -- this is UI chrome (nav links, button labels), not prose. Match the English's brevity.
${SHARED_RULES}`;

const CONTENT_SYSTEM = `You translate marketing website copy for ${BUSINESS_NAME}, a white-water rafting, zipline, ATV and riverside camping operator in Phang Nga, Thailand, family-run since 2002, from English into the target language.

You are given a JSON object mapping field keys to English text (headings, subheadings, button labels and short marketing paragraphs). Return ONLY a JSON object with the exact same keys, each value replaced by its translation -- no other keys, no missing keys, no explanation, no markdown code fence.

- Match the register of the English: warm and inviting, not stiff or literal. A heading stays a heading; a button label stays short.
- Keep roughly the same length as the English. This copy sits in a fixed page layout -- a translation twice as long breaks it.
${SHARED_RULES}`;

/**
 * Returns null if `locale` has nothing to translate (English, or an
 * unrecognized value) -- same "not applicable" contract as aiComplete
 * returning null for "AI not configured", so callers treat both as a normal,
 * non-error state.
 *
 * THROWS on a malformed/non-JSON response or a real API failure -- same
 * staff-facing "don't silently save garbage" stance as blog-ai.ts/
 * gallery-ai.ts, enforced by requireCompleteText for the cut-off/empty cases.
 */
async function translateFieldMap(
  fields: Record<string, string>,
  locale: Locale,
  system: string,
  maxTokens: number,
  config: AiConfig,
  timeoutMs?: number
): Promise<Record<string, string> | null> {
  const localeName = LOCALE_NAMES[locale];
  if (!localeName) return null;

  const reply = await aiComplete(
    {
      system,
      messages: [{ role: "user", content: `Target language: ${localeName}\n\n${JSON.stringify(fields, null, 2)}` }],
      maxTokens,
      ...(timeoutMs ? { timeoutMs } : {}),
    },
    config
  );
  if (!reply) return null;
  const text = requireCompleteText(reply.text, reply.stopReason);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("The AI's response wasn't valid JSON. Try again.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The AI's response wasn't in the expected format. Try again.");
  }

  // Only keys with non-empty string values survive. The caller's
  // saveTranslations applies an allowed-keys filter again on write, so a
  // stray/renamed key from a model that ignored the "same keys" instruction
  // can't pollute the table -- belt and suspenders across the two files that
  // touch untrusted AI output.
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) result[key] = value.trim();
  }

  // A response can be valid JSON and still be useless -- e.g. every value came
  // back as a number/nested object, or every key was renamed so nothing
  // matched. Without this, the caller would save an empty batch, report
  // ok:true, and staff would see "Generate" silently do nothing instead of the
  // "try again" every other malformed-output case above already gets.
  if (Object.keys(result).length === 0) {
    throw new Error("The AI's response didn't contain any usable translations. Try again.");
  }
  return result;
}

export function translateChromeStrings(
  locale: Locale,
  config: AiConfig
): Promise<Record<string, string> | null> {
  const input = Object.fromEntries(CHROME_STRINGS.map((s) => [s.key, s.en]));
  // Output JSON is small, but MiniMax-M2 spends its budget on private
  // `thinking` blocks first (lib/ai.ts's AI_MODEL comment) -- generous
  // headroom, not tuned to this output's size.
  return translateFieldMap(input, locale, CHROME_SYSTEM, 4000, config);
}

/**
 * Homepage copy (hero, the supporting bands, SEO meta) -- see
 * lib/translatable-content.ts for what's included and why image ids and
 * headingEmphasis aren't.
 *
 * A bigger budget than chrome: this is ~40 fields of real marketing prose
 * (the why-cards alone are a paragraph each), and MiniMax-M2 pays for its
 * thinking out of the same allowance. A cut-off response here fails loudly
 * via requireCompleteText rather than saving half a page.
 *
 * The DEADLINE has to move with the budget, not just max_tokens: aiComplete's
 * default 45s is sized for the guest chatbot's short replies, and a response
 * this size (thousands of tokens of thinking + ~4.5kB of translated copy)
 * cannot physically arrive that fast -- left at the default, this call would
 * hit the Promise.race timeout on every run no matter how large max_tokens
 * was. 90s is aiComplete's clamp, chosen to stay under Cloudflare's ~100s
 * edge timeout so a slow run still surfaces our own error message.
 */
export function translateContentFields(
  fields: Record<string, string>,
  locale: Locale,
  config: AiConfig
): Promise<Record<string, string> | null> {
  return translateFieldMap(fields, locale, CONTENT_SYSTEM, 12000, config, 90_000);
}

// MiniMax occasionally wraps JSON in a ```json fence despite the "no markdown"
// instruction -- stripped defensively rather than tightening the prompt
// further, since a fence around otherwise-valid JSON is harmless to strip.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}
