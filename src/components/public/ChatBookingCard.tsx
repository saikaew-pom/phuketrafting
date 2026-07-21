"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Check } from "lucide-react";
import { baht } from "@/lib/format";

// window.turnstile's reset() is already declared globally (BookingWidget.tsx
// and three siblings) -- every `declare global` copy must agree, so it isn't
// redeclared here. See TurnstileRenderApi below for the two members this card
// needs that those copies don't carry.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// How long to keep waiting for api.js before giving up on the widget. Only
// reached when the script never arrives (ad-blocker, offline); the guest then
// gets the server's "couldn't verify you're human" and the WhatsApp fallback
// the chat already offers, rather than a timer that spins for the session.
const TURNSTILE_WAIT_MS = 15000;
const TURNSTILE_POLL_MS = 200;

/**
 * api.js also exposes render()/remove(), which this card needs and no other
 * form does. The shared `declare global` for window.turnstile carries only
 * reset(), and TypeScript requires every copy of it to be identical -- and
 * there are four identical copies (BookingWidget, CampBookingWidget,
 * EnquiryForm, ManageBookingRequestForm), so widening it means editing all
 * four. Narrowed here instead, at the one call site that needs the extra two.
 */
interface TurnstileRenderApi {
  render: (
    container: HTMLElement,
    params: { sitekey: string; size?: "normal" | "compact" | "flexible" }
  ) => string | undefined;
  remove: (widget: string) => void;
}

function turnstileApi(): TurnstileRenderApi | undefined {
  return window.turnstile as unknown as TurnstileRenderApi | undefined;
}

/**
 * The review card (plan §9's prepare -> CARD -> confirm).
 *
 * Two jobs, both safety ones:
 *
 * 1. It puts a human between the model and a real booking. The model can only
 *    propose a draft; nothing happens until the guest reads this and presses
 *    Confirm. Every value shown was computed server-side from D1 -- the model
 *    supplies none of it -- so what the guest agrees to is what the booking
 *    will be, even if the bot said something different in chat.
 *
 * 2. It collects name/phone/email as REAL FORM FIELDS. Plan §9 is explicit
 *    that these are optional in the AI tool schema because "required fields
 *    make the model invent placeholders" -- a model asked for a required phone
 *    emits "0812345678" rather than admitting it doesn't know. Typed by the
 *    guest, validated by the server, never guessed by a model.
 */

export interface BookingDraft {
  token: string;
  tourName: string;
  date: string;
  startTime: string;
  adults: number;
  children: number;
  infants: number;
  pickupZoneName: string | null;
  total: number;
  depositAmount: number;
  balanceAmount: number;
  expiresAt: number;
}

interface Props {
  draft: BookingDraft;
  onConfirmed: (message: string) => void;
}

export function ChatBookingCard({ draft, onConfirmed }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Rendered EXPLICITLY, unlike every other Turnstile widget on the site.
  //
  // Implicit rendering (the `cf-turnstile` class) is a ONE-SHOT DOM scan that
  // api.js runs when it finishes loading -- there is no MutationObserver in
  // the bundle, confirmed by reading it and then live on this site: a
  // .cf-turnstile div appended to the page after api.js had loaded stayed
  // permanently empty, with no cf-turnstile-response input in its form and an
  // empty FormData token. Every other widget here (BookingWidget, EnquiryForm,
  // CampBookingWidget, the manage forms, WaiverForm) is in the document at
  // first paint, so the one scan reaches all of them.
  //
  // This card is the one that isn't: it mounts mid-conversation, by which time
  // api.js has long since loaded and scanned for the landing page's own three
  // widgets. Left implicit it would never render, so Confirm would post an
  // empty token to a route that now requires one -- a 400 on every attempt,
  // and no retry could ever fix it. A second draft in the same conversation
  // would fail the same way even on a page with no other widget, since the
  // replacement card mounts after that page's first (and only) scan too.
  //
  // The container deliberately does NOT carry the `cf-turnstile` class: on a
  // page where this card IS the first widget, its own <Script> loads api.js
  // while the container already exists, and the implicit scan would then
  // render a SECOND widget into it alongside this one.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const tryRender = (): boolean => {
      const el = turnstileRef.current;
      if (widgetIdRef.current !== null) return true;
      const api = turnstileApi();
      if (!el || !api?.render) return false;
      widgetIdRef.current =
        api.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          // The normal widget is a hard 300px wide. The chat panel's card is
          // ~198px inside a 320px viewport, and .pr-chat clips its overflow --
          // a normal widget hangs 54px past the panel edge and drags the whole
          // form (inputs, Confirm button) out with it. Compact is 150x140 and
          // fits with room to spare. Measured live at 320/375px.
          size: "compact",
        }) ?? null;
      return widgetIdRef.current !== null;
    };

    // api.js may already be loaded (another widget rendered it) or still be in
    // flight (this card's <Script> is its first request), and next/script fires
    // no load event for the already-loaded case. Poll rather than guess which.
    if (!tryRender()) {
      const deadline = Date.now() + TURNSTILE_WAIT_MS;
      timer = setInterval(() => {
        if (tryRender() || Date.now() > deadline) stop();
      }, TURNSTILE_POLL_MS);
    }

    return () => {
      stop();
      // Card unmounts when Confirm succeeds, or when a newer draft replaces it
      // (ChatWidget renders only the last one). Drop the widget from
      // Turnstile's registry so its refresh timers stop running against a node
      // that is no longer in the document.
      if (widgetIdRef.current) turnstileApi()?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  const guests = [
    draft.adults ? `${draft.adults} adult${draft.adults === 1 ? "" : "s"}` : null,
    draft.children ? `${draft.children} child${draft.children === 1 ? "" : "ren"}` : null,
    draft.infants ? `${draft.infants} infant${draft.infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  function resetTurnstile() {
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }

  async function confirm(turnstileToken: string) {
    // Each press creates a real booking and claims a real seat, so a
    // double-tap must not reach the server twice. The server's guarded draft
    // claim is the real defence; this is just politeness.
    if (pending || done) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: draft.token, name, phone, email, turnstileToken }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong -- please try again.");
        // Turnstile tokens are single-use -- a rejected submission (bad
        // field, an already-spent token) must reset the widget or every
        // retry replays the dead token and fails forever. Same pattern as
        // BookingWidget.tsx. Reset THIS widget by the id explicit render
        // returned, not a bare reset(): the chat panel is open alongside the
        // landing page's own widgets, and a bare reset() clears only one.
        resetTurnstile();
        return;
      }
      setDone(true);
      onConfirmed("Booking request sent.");
    } catch {
      setError("Couldn't reach us just now -- please check your connection and try again.");
      resetTurnstile();
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="pr-chat-card pr-chat-card-done">
        <Check size={16} className="pr-ico" /> Request sent -- our team will confirm shortly.
      </div>
    );
  }

  return (
    <div className="pr-chat-card">
      <p className="pr-chat-card-title">{draft.tourName}</p>
      <p className="pr-chat-card-meta">
        {draft.date} at {draft.startTime}
        <br />
        {guests}
        {draft.pickupZoneName && (
          <>
            <br />
            Pickup: {draft.pickupZoneName}
          </>
        )}
      </p>

      <p className="pr-chat-card-price">
        <strong>{baht(draft.total)}</strong>
        {/* Only stated when there IS a split to state -- under a pay_on_day
            policy the deposit is 0 and "pay ฿0 now" would be nonsense. Same
            gate as the booking widget's split line. */}
        {draft.depositAmount > 0 && draft.balanceAmount > 0 && (
          <span className="pr-chat-card-split">
            {" "}
            &middot; pay {baht(draft.depositAmount)} now, {baht(draft.balanceAmount)} on the day
          </span>
        )}
      </p>

      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Turnstile injects its token as a hidden "cf-turnstile-response"
          // input into the containing form -- explicit render does this just
          // as implicit does (verified live: one input, 816-char token). This
          // card POSTs JSON via fetch rather than a native form action, so the
          // token is read off the form HERE instead of arriving through
          // FormData server-side, the way BookingWidget.tsx's native
          // <form action={...}> gets it for free.
          const token = String(new FormData(e.currentTarget).get("cf-turnstile-response") ?? "");
          void confirm(token);
        }}
      >
        <input
          className="pr-chat-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          minLength={2}
          maxLength={120}
          aria-label="Your name"
        />
        <input
          className="pr-chat-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone, e.g. +66 81 234 5678"
          type="tel"
          required
          aria-label="Your phone number"
        />
        <input
          className="pr-chat-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          type="email"
          aria-label="Your email"
        />
        {/* No `cf-turnstile` class and no data-sitekey: this widget is rendered
            explicitly by the effect above, and the class is exactly what would
            make api.js's implicit scan render a second one into it. */}
        {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="pr-chat-turnstile" />}
        {error && <p className="pr-chat-err">{error}</p>}
        <button className="pr-btn pr-btn-accent pr-btn-block" type="submit" disabled={pending}>
          {pending ? "Sending..." : "Confirm request"}
        </button>
        {/* Says plainly what pressing this does. Plan §9's human-in-the-loop
            rule means it is NOT a confirmed booking, and the guest must know
            that before they press, not only after. */}
        <p className="pr-chat-card-note">
          This sends a request -- our team confirms every booking by hand. Nothing is charged now.
        </p>
      </form>
    </div>
  );
}
