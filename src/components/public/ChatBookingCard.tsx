"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { baht } from "@/lib/format";

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

  const guests = [
    draft.adults ? `${draft.adults} adult${draft.adults === 1 ? "" : "s"}` : null,
    draft.children ? `${draft.children} child${draft.children === 1 ? "" : "ren"}` : null,
    draft.infants ? `${draft.infants} infant${draft.infants === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  async function confirm() {
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
        body: JSON.stringify({ token: draft.token, name, phone, email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong -- please try again.");
        return;
      }
      setDone(true);
      onConfirmed("Booking request sent.");
    } catch {
      setError("Couldn't reach us just now -- please check your connection and try again.");
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
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
