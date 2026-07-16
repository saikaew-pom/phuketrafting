/**
 * Extracts the Q&A pairs out of a post's "## FAQ" section (plan §10: every
 * post carries "one FAQ block").
 *
 * The FAQ lives in the post's own markdown rather than in its own column or
 * table, deliberately. Google's structured-data policy requires FAQPage
 * markup to match content actually VISIBLE on the page -- markup describing
 * questions a reader can't see is a manual-action risk, not a free rich
 * result. Parsing the rendered body guarantees the two can never drift:
 * there is only one copy of the FAQ, BlogBody.tsx renders it as real
 * headings and paragraphs, and this reads the same source for the markup.
 *
 * It also means no migration and nothing new for staff to learn -- an FAQ is
 * just a section they type (or the AI drafts) like any other.
 */

export interface BlogFaq {
  q: string;
  a: string;
}

/** Matches the FAQ section's own heading. Tolerant of what staff/AI actually write. */
const FAQ_HEADING = /^##\s+(FAQ|FAQs|Frequently asked questions|Common questions)\s*$/i;
const H2 = /^##\s+/;
const H3 = /^###\s+(.*)$/;

export function extractFaqs(markdown: string): BlogFaq[] {
  // Same CRLF normalization BlogBody.tsx does before it splits into blocks.
  // The two parsers read the same source and must agree about where lines
  // start and end, or the markup describes questions the page doesn't show.
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const faqs: BlogFaq[] = [];

  let inFaqSection = false;
  let question: string | null = null;
  let answer: string[] = [];

  const flush = () => {
    // A question with no answer under it is not a usable FAQ entry -- emitting
    // one would produce FAQPage markup with an empty acceptedAnswer, which
    // Google rejects outright.
    const text = answer.join(" ").replace(/\s+/g, " ").trim();
    if (question && text) faqs.push({ q: question, a: text });
    question = null;
    answer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (FAQ_HEADING.test(line)) {
      inFaqSection = true;
      continue;
    }
    if (!inFaqSection) continue;

    // Any other h2 ends the FAQ section -- the block is one contiguous run,
    // so a "## Ready to book?" closer after it doesn't get swallowed.
    if (H2.test(line)) {
      flush();
      inFaqSection = false;
      continue;
    }

    const heading = H3.exec(line);
    if (heading) {
      flush();
      question = heading[1].trim();
      continue;
    }

    if (question && line) answer.push(stripInlineMarkdown(line));
  }
  flush();

  return faqs;
}

/**
 * JSON-LD answer text is plain text, not markdown -- a literal "**bold**" or
 * "[label](/url)" in the markup is what a search engine would read back to a
 * user verbatim.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/, "")
    // "#### Sub-heading" inside an answer: BlogBody renders it as <h4>Sub-heading</h4>,
    // so the answer text must read "Sub-heading", not a literal "#### Sub-heading".
    // Only h4 can reach here -- "##" ends the section and "###" starts a question.
    .replace(/^#{4}\s+/, "");
}
