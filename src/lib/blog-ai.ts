import { aiComplete, requireCompleteText, type AiConfig } from "@/lib/ai";
import { listTours, getTourRates } from "@/lib/queries/tours";
import { listCampZones, getCampRates } from "@/lib/queries/camping";
import { categoryLabel } from "@/lib/queries/blog";
import { BUSINESS_NAME } from "@/lib/site";

/**
 * "Write draft" / "Generate excerpt" buttons in the dashboard blog editor
 * (plan §3: "AI 'write draft'/'generate excerpt' buttons that are
 * suggestions only... grounded in real DB tours/prices, medical/safety-claim
 * guardrails"). Same one-shot-call shape as Ton Mai's lib/blog-ai.js, ported
 * to this project's MiniMax client (src/lib/ai.ts) and to markdown output
 * (BlogBody.tsx renders markdown, not HTML -- Ton Mai's editor is
 * contentEditable HTML, this one is a plain textarea over the same `content`
 * column the public page renders).
 *
 * "Suggestions only" is enforced by where these functions are called from:
 * they fill a form field a human then reviews and explicitly saves. Nothing
 * here writes to D1.
 */

/**
 * Real tour/camp facts, same grounding purpose as chat/grounding.ts's
 * FACTS section -- a model left to recall its own idea of "roughly 3000
 * baht" will invent a number, and a published post quoting the wrong price
 * is a real, public, indexed mistake (worse than a chat reply, which
 * disappears with the conversation).
 */
async function buildFactsBlock(): Promise<string> {
  const [tours, campZones] = await Promise.all([listTours(), listCampZones()]);

  const tourLines = await Promise.all(
    tours
      .filter((t) => t.is_active === 1)
      .map(async (t) => {
        const rates = await getTourRates(t.id);
        const adultPrice = rates.find((r) => r.price > 0)?.price;
        return `- ${t.name}${t.tagline ? ` (${t.tagline})` : ""}: ${adultPrice ? `from THB ${adultPrice}` : "price on request"}, ${[t.distance_km ? `${t.distance_km}km` : null, t.duration_label].filter(Boolean).join(", ") || "duration on request"}`;
      })
  );

  const campLines = await Promise.all(
    campZones
      .filter((z) => z.is_active === 1)
      .map(async (z) => {
        const rates = await getCampRates(z.id);
        const from = rates.find((r) => r.is_active === 1)?.price_weekday;
        return `- ${z.name}${z.sleeps_label ? ` (${z.sleeps_label})` : ""}: ${from ? `from THB ${from}/night` : "price on request"}`;
      })
  );

  return [
    "### Tours", tourLines.join("\n") || "(none configured)",
    "### Camping zones", campLines.join("\n") || "(none configured)",
  ].join("\n\n");
}

const GUARDRAILS = `Hard rules:
- Use ONLY the facts given to you when stating a price, distance, duration or what's included -- never invent or estimate a number.
- Never make a medical claim or safety guarantee ("safe for your back", "cures", "guaranteed"). General wellness/adventure language is fine ("an invigorating way to spend the day"); if the topic touches pregnancy, injury, medical conditions or age limits, say the reader should check with our team, not answer for them.
- Never invent a discount, availability claim, or a fact about ${BUSINESS_NAME} not given to you.`;

const DRAFT_SYSTEM = `You are writing a blog post for ${BUSINESS_NAME}, a white-water rafting, zipline, ATV and riverside camping operator in Phang Nga, Thailand, family-run since 2002.

You are given the post's title, its category, and real facts about our tours and camping zones -- use them for anything specific to us.

Write an 800-1200 word article body in MARKDOWN: use "## " and "### " for headings (never "# ", the title is shown separately), "**bold**" for emphasis, "- " for bullet lists, and blank lines between paragraphs. Plain prose otherwise -- no HTML tags, no code fences. Tone: warm, informative, editorial -- like a knowledgeable local writing for a curious traveler, not a sales brochure.

Structure every post this way:
1. The article itself, in "## " sections.
2. Link at least once to whichever of these the post is actually about, in markdown link form: our tour packages ([our tour packages](/en#tours)) or our riverside camping ([riverside camping](/en#camp-book)). Only link the one the article is genuinely about -- a forced link to both helps nobody.
3. End with a "## FAQ" section of 3-5 real questions a traveler would ask about THIS topic. Each question is a "### " heading phrased as the traveler would ask it, with a 1-3 sentence answer underneath. Answer only from the facts you were given; if a question can't be answered from them, ask a different question.

${GUARDRAILS}

Return ONLY the markdown body, nothing else -- no title, no explanation before or after.`;

const EXCERPT_SYSTEM = `You are writing a short excerpt/teaser for a blog post, shown on the blog index page. You are given the full article body. Write exactly 1-2 plain-English sentences (no markdown, no HTML) summarizing what the post covers, in an inviting but honest tone -- not clickbait. Return ONLY the excerpt text, nothing else.`;

export async function generateBlogDraft(title: string, category: string, config: AiConfig): Promise<string | null> {
  const facts = await buildFactsBlock();
  const reply = await aiComplete(
    {
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Title: ${title}\nCategory: ${categoryLabel(category)}\n\nReal facts to draw from:\n\n${facts}`,
        },
      ],
      // Draft is 800-1200 words (~1100-1600 tokens); MiniMax-M2 spends the
      // same budget on its private `thinking` blocks first (lib/ai.ts's
      // AI_MODEL comment) -- a tight budget here silently truncates or
      // returns empty text, same failure mode already found and fixed once
      // in the chatbot (Phase 6). Generous headroom, not a tuned minimum.
      maxTokens: 6000,
    },
    config
  );
  if (!reply) return null; // AI not configured -- same "no chatbot" contract as aiComplete's other callers.
  return requireCompleteText(reply.text, reply.stopReason);
}

export async function generateBlogExcerpt(body: string, config: AiConfig): Promise<string | null> {
  const reply = await aiComplete(
    {
      system: EXCERPT_SYSTEM,
      messages: [{ role: "user", content: body }],
      maxTokens: 1500,
    },
    config
  );
  if (!reply) return null;
  return requireCompleteText(reply.text, reply.stopReason);
}
