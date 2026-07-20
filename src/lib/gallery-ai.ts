import { aiComplete, requireCompleteText, type AiConfig } from "@/lib/ai";
import { BUSINESS_NAME } from "@/lib/site";

/**
 * "Suggest caption" button on the gallery's multi-upload screen. Same
 * one-shot, staff-reviewed, throws-on-failure shape as lib/blog-ai.ts's
 * draft/excerpt generators -- the result fills an editable caption field a
 * human saves explicitly, nothing here writes to D1.
 *
 * MiniMax-M2 (lib/ai.ts's AI_MODEL) is TEXT-ONLY -- it cannot see the photo.
 * The caption is generated from a short hint staff type describing the shot
 * (e.g. "guests paddling through rapids"), not from the image itself. If a
 * vision-capable MiniMax model is ever wired in, this is the function to
 * extend with an image content block -- not a new one.
 */

const CAPTION_SYSTEM = `You write short photo captions for ${BUSINESS_NAME}, a white-water rafting, zipline, ATV and riverside camping operator in Phang Nga, Thailand, family-run since 2002.

You are given a short hint describing what a photo shows. Write ONE natural caption, under 90 characters, suitable both as a visible caption and as image alt text -- descriptive and inviting, naturally including a relevant keyword (the activity, or "Phang Nga") without sounding keyword-stuffed.

Hard rules:
- Base the caption ONLY on the hint given -- never invent people, places, or details not in it.
- Never make a medical claim or safety guarantee.
- Return ONLY the caption text -- no quotes, no explanation, no trailing period unless it reads naturally.`;

export async function suggestGalleryCaption(hint: string, config: AiConfig): Promise<string | null> {
  const reply = await aiComplete(
    {
      system: CAPTION_SYSTEM,
      messages: [{ role: "user", content: `Photo hint: ${hint}` }],
      // Output is a few words, but MiniMax-M2 spends the same budget on its
      // private `thinking` blocks first (see lib/ai.ts's AI_MODEL comment) --
      // matched to generateBlogExcerpt's budget for the same short-output shape.
      maxTokens: 1500,
    },
    config
  );
  if (!reply) return null; // AI not configured -- same "no AI" contract as every other aiComplete caller.
  return requireCompleteText(reply.text, reply.stopReason);
}
