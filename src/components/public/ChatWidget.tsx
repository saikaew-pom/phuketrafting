"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { ChatMessageBody } from "./ChatMessage";
import { ChatBookingCard, type BookingDraft } from "./ChatBookingCard";

interface Turn {
  role: "guest" | "bot";
  text: string;
  /** Present on the turn where the bot proposed a booking -- renders the card. */
  draft?: BookingDraft;
}

const SESSION_KEY = "pr-chat-session";

/**
 * The public chat widget (plan §9, info mode).
 *
 * Rendered only when staff have the chatbot enabled -- the server decides that
 * (layout reads getChatPolicy) and passes it down, so a disabled bot ships no
 * widget at all rather than a button that fails on click.
 */
export function ChatWidget({ greeting }: { greeting: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // sessionStorage, not localStorage: the thread is meant to last a visit, not
  // to follow someone across weeks on a shared hotel-lobby machine. It's also
  // why nothing sensitive is ever put in a chat thread.
  const sessionIdRef = useRef<string>("");
  useEffect(() => {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    sessionIdRef.current = id;
  }, []);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  // The newest turn that carries a draft. Everything older is display-only.
  const lastDraftIndex = turns.reduce((acc, t, i) => (t.draft ? i : acc), -1);

  async function send() {
    const message = input.trim();
    // `pending` guards a double-send: each turn costs real tokens, so a
    // double-tap is a double bill, not just a duplicate bubble.
    if (!message || pending) return;

    setInput("");
    setError(null);
    setTurns((t) => [...t, { role: "guest", text: message }]);
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message }),
      });
      const data = (await res.json()) as { reply?: string | null; error?: string; staffHandling?: boolean; draft?: BookingDraft };

      if (!res.ok) {
        // 429 and validation errors arrive here. Shown as an error line rather
        // than a bot bubble: the bot did not say this, and dressing our own
        // rate limiter up as the assistant talking would be a small lie.
        setError(data.error ?? "Something went wrong -- please try again.");
        return;
      }
      if (data.staffHandling) {
        setTurns((t) => [...t, { role: "bot", text: "Our team is reading this thread and will reply here shortly." }]);
        return;
      }
      if (data.reply) setTurns((t) => [...t, { role: "bot", text: data.reply!, draft: data.draft }]);
    } catch {
      // A network failure is ours, not the bot's -- same reasoning as above.
      setError("Couldn't reach us just now -- please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button className="pr-chat-fab" onClick={() => setOpen(true)} aria-label="Chat with us">
        <MessageCircle size={22} />
      </button>
    );
  }

  return (
    <div className="pr-chat" role="dialog" aria-label="Chat">
      <div className="pr-chat-head">
        <span className="pr-chat-title">Ask us anything</span>
        <button className="pr-chat-x" onClick={() => setOpen(false)} aria-label="Close chat">
          <X size={18} />
        </button>
      </div>

      <div className="pr-chat-body" ref={scrollRef}>
        <div className="pr-chat-msg pr-chat-bot">
          <ChatMessageBody text={greeting} />
        </div>
        {turns.map((t, i) => (
          <div key={i} className={"pr-chat-msg " + (t.role === "guest" ? "pr-chat-guest" : "pr-chat-bot")}>
            {/* Guest text is rendered as a plain string -- React escapes it.
                Bot text goes through ChatMessageBody, which builds React nodes
                rather than HTML; see that file on why this is a security
                boundary and not just formatting. */}
            {t.role === "guest" ? <p>{t.text}</p> : <ChatMessageBody text={t.text} />}
            {/* Only the LAST draft is interactive: an older card's token has
                been retired server-side (one draft slot), so leaving earlier
                cards pressable would invite a confirm that can only fail. */}
            {t.draft && i === lastDraftIndex && (
              <ChatBookingCard
                draft={t.draft}
                onConfirmed={(msg) => setTurns((prev) => [...prev, { role: "bot", text: msg }])}
              />
            )}
          </div>
        ))}
        {pending && (
          <div className="pr-chat-msg pr-chat-bot pr-chat-typing" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && <p className="pr-chat-err">{error}</p>}
      </div>

      <form
        className="pr-chat-foot"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="pr-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Prices, pickup, what to bring..."
          // Mirrors the server's Zod bound. Advisory only -- the server is the
          // real limit, since anything can POST /api/chat directly.
          maxLength={1000}
          disabled={pending}
          aria-label="Your message"
        />
        <button className="pr-chat-send" type="submit" disabled={pending || !input.trim()} aria-label="Send">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
