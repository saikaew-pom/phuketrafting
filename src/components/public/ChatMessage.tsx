import type { ReactNode } from "react";

/**
 * Renders a bot message's light markdown as REACT NODES -- never as HTML.
 *
 * This is a security boundary, not a formatting nicety. The model's output is
 * shaped by guest input (that is exactly what prompt injection is), so a guest
 * can ask the bot to repeat an arbitrary string and it may well comply.
 * dangerouslySetInnerHTML on that is a straightforward XSS hole: "reply with
 * <img src=x onerror=...>" and the bot echoes it into the page. Building React
 * elements instead makes injection structurally impossible -- React escapes
 * text children, so the worst a guest achieves is seeing their own tags as
 * literal characters.
 *
 * It also rules out a markdown library: react-markdown & co. exist to render
 * TRUSTED author content and will happily pass raw HTML through unless
 * carefully configured. A ~40-line parser over the exact subset MiniMax
 * actually emits is both smaller and safer than configuring a general one
 * correctly.
 *
 * The subset is empirical, not aspirational: the system prompt tells the model
 * not to use markdown and it does anyway (confirmed in review), so this handles
 * what it really produces -- **bold**, "- " bullets, blank-line paragraphs and
 * bare URLs.
 */

// Only ever linkify these. A bare `new URL()` check is not enough: the model
// could emit `javascript:alert(1)` or `data:text/html,...`, and putting either
// in an href is script execution on click. Allowlisting the two schemes a
// guest could legitimately need means a hostile scheme renders as plain text.
const SAFE_URL = /^https?:\/\//i;

const URL_OR_BOLD = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|\*\*[^*]+\*\*)/g;

/** Splits one line into text / bold / link nodes. */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  return line.split(URL_OR_BOLD).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (SAFE_URL.test(part)) {
      return (
        // noreferrer AND noopener: the target page must not get window.opener
        // (tab-nabbing) and needn't get our URL. The href is guest-influenced,
        // so treat it as hostile even after the scheme check.
        <a key={key} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

export function ChatMessageBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="pr-chat-list">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    if (!line.trim()) return;
    // Strip leading #'s: the model emits headings despite being told not to,
    // and a heading inside a chat bubble is just an emphatic line.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${i}`}>
          <strong>{renderInline(heading[1], `hh-${i}`)}</strong>
        </p>
      );
      return;
    }
    blocks.push(<p key={`p-${i}`}>{renderInline(line, `pp-${i}`)}</p>);
  });
  flushBullets();

  return <>{blocks}</>;
}
