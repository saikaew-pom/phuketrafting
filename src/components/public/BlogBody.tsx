import type { ReactNode } from "react";

/**
 * Renders a blog post's markdown body as React nodes -- never via
 * dangerouslySetInnerHTML.
 *
 * Unlike ChatMessage.tsx's parser, this content IS from a trusted author
 * (staff behind Cloudflare Access, or AI-generated content that's
 * human-reviewed before import per plan §10) -- a general markdown library
 * would be a defensible choice here. Written by hand anyway, for the same
 * reason ChatMessage.tsx gives: a parser scoped to the exact subset the
 * pipeline actually produces (headings, bold/italic, links, lists,
 * paragraphs) is smaller than configuring a library to be safe, and
 * React-node construction means a stray "<script>" typed into the dashboard
 * editor renders as literal text instead of executing -- free defense in
 * depth even though the author is trusted.
 */

// Internal paths and https links only -- javascript:/data: schemes render as
// literal text rather than a clickable link, same allowlist reasoning as
// ChatMessage.tsx's SAFE_URL.
const EXTERNAL_HREF = /^https?:\/\//i;

// A leading "/" alone isn't enough: "//evil.com" and "/\evil.com" both start
// with "/" but the WHATWG URL parser (i.e. every browser) resolves them as
// scheme-relative references to an external origin -- "//evil.com" becomes
// https://evil.com, and a leading backslash is normalized to a slash for
// http(s). Resolving against a throwaway base and checking the origin came
// back unchanged is what actually tells internal from external, not the
// character prefix.
function isSafeInternalHref(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  try {
    return new URL(href, "http://internal.invalid").origin === "http://internal.invalid";
  } catch {
    return false;
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const [, label, href] = link;
        const external = EXTERNAL_HREF.test(href);
        if (external || isSafeInternalHref(href)) {
          return (
            <a key={key} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {label}
            </a>
          );
        }
        return <span key={key}>{label}</span>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return <span key={key}>{part}</span>;
    });
}

export function BlogBody({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let bi = 0;

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${bi++}`}>
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `li-${bi}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  // Blank-line-separated blocks, same as ChatMessage's line-by-line approach
  // but with heading levels preserved (a real <h2>, not a bolded paragraph --
  // blog posts need a real outline for readability and SEO, a chat bubble doesn't).
  for (const raw of markdown.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const lines = block.split("\n").map((l) => l.trim());
    const allBullets = lines.every((l) => /^[-*]\s+/.test(l));
    if (allBullets) {
      flushBullets();
      bullets = lines.map((l) => l.replace(/^[-*]\s+/, ""));
      flushBullets();
      continue;
    }
    flushBullets();

    const heading = block.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length; // ## -> h2, ### -> h3, #### -> h4
      const key = `h-${bi++}`;
      const content = renderInline(heading[2], key);
      if (level === 2) blocks.push(<h2 key={key}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={key}>{content}</h3>);
      else blocks.push(<h4 key={key}>{content}</h4>);
      continue;
    }

    blocks.push(<p key={`p-${bi++}`}>{renderInline(block.replace(/\n/g, " "), `pp-${bi}`)}</p>);
  }
  flushBullets();

  return <>{blocks}</>;
}
