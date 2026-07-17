"use client";

import { useActionState, useEffect, useRef } from "react";
import Script from "next/script";
import { Send } from "lucide-react";
import { submitEnquiry, type EnquiryFormState } from "@/app/[lang]/enquiry-actions";

declare global {
  interface Window {
    // Reset must target THIS form's widget by container element: the landing
    // page renders three Turnstile widgets (BookingWidget, CampBookingWidget,
    // this form), and a no-argument reset() clears only one of them -- so a
    // bare reset() here would clear a different form's widget and leave this
    // form's spent single-use token in place, locking the guest out on retry.
    // Same container-scoped reset as ManageBookingRequestForm. (Audit A4.)
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Defined here, not exported from enquiry-actions.ts -- a "use server" file
// may only export async functions (they become Server Action references);
// a plain object export breaks Next's server-reference transform.
const INITIAL_STATE: EnquiryFormState = { status: "idle" };

export function EnquiryForm({ locale }: { locale: string }) {
  const [state, formAction, pending] = useActionState(submitEnquiry, INITIAL_STATE);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Turnstile tokens are single-use. Any rejected submission (a bad Zod
  // field, an expired/already-consumed token) leaves the stale, now-spent
  // token sitting in the hidden input -- without a reset, resubmitting
  // after fixing the form replays that dead token and is wrongly rejected
  // as "not human" every time, forever, until a full page reload. Reset THIS
  // form's widget by container (see the Window type comment). (Audit A4.)
  useEffect(() => {
    if (state.status === "error" && turnstileRef.current) {
      window.turnstile?.reset(turnstileRef.current);
    }
  }, [state]);

  // On success the form (5 fields + Turnstile widget + button) unmounts,
  // collapsing several hundred pixels of height. This section sits well down
  // the landing page, so that collapse pulls everything below it up past a
  // guest's current scroll position -- the confirmation renders, but above
  // the viewport, and looks like the submission vanished. Same pattern as
  // BookingWidget.tsx's hash-jump scroll. Only on success: an error leaves
  // the form (and this message, which renders above it) in place, so scroll
  // position is already correct and jumping would just yank focus away from
  // the field the guest is about to fix.
  useEffect(() => {
    if (state.status === "success") {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state]);

  return (
    <div className="pr-enquiry">
      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      {state.status !== "idle" && (
        <p
          ref={statusRef}
          className={"pr-enquiry-status " + (state.status === "success" ? "pr-enquiry-status-success" : "pr-enquiry-status-error")}
        >
          {state.message}
        </p>
      )}

      {state.status !== "success" && (
        <form action={formAction}>
          <input type="hidden" name="locale" value={locale} />

          <label className="pr-field">
            <span className="pr-field-lbl">Name</span>
            <input className="pr-input" type="text" name="name" required maxLength={120} />
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Email</span>
            <input className="pr-input" type="email" name="email" required />
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Phone (optional)</span>
            <input className="pr-input" type="tel" name="phone" maxLength={40} />
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Message</span>
            <textarea className="pr-input" name="message" required minLength={10} maxLength={2000} rows={4} />
          </label>

          <label className="pr-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" name="consent_marketing" />
            <span className="pr-field-lbl" style={{ margin: 0 }}>
              I&apos;m okay receiving occasional offers by email (optional)
            </span>
          </label>

          {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

          <button className="pr-btn pr-btn-accent pr-btn-block" type="submit" disabled={pending}>
            <Send size={17} className="pr-ico" /> {pending ? "Sending..." : "Send message"}
          </button>
        </form>
      )}
    </div>
  );
}
