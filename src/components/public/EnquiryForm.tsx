"use client";

import { useActionState, useEffect } from "react";
import Script from "next/script";
import { Send } from "lucide-react";
import { submitEnquiry, type EnquiryFormState } from "@/app/[lang]/enquiry-actions";

declare global {
  interface Window {
    // Widened from (widgetId?: string) to also accept a container element:
    // TypeScript requires every `declare global` copy of this interface to
    // agree, and the two forms on the manage page must reset by container
    // (see ManageBookingRequestForm.tsx). This form is the sole widget on its
    // page, so its own bare reset() stays correct.
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

  // Turnstile tokens are single-use. Any rejected submission (a bad Zod
  // field, an expired/already-consumed token) leaves the stale, now-spent
  // token sitting in the hidden input -- without a reset, resubmitting
  // after fixing the form replays that dead token and is wrongly rejected
  // as "not human" every time, forever, until a full page reload.
  useEffect(() => {
    if (state.status === "error") {
      window.turnstile?.reset();
    }
  }, [state]);

  return (
    <div className="pr-enquiry">
      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      {state.status !== "idle" && (
        <p className={"pr-enquiry-status " + (state.status === "success" ? "pr-enquiry-status-success" : "pr-enquiry-status-error")}>
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

          {TURNSTILE_SITE_KEY && <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

          <button className="pr-btn pr-btn-accent pr-btn-block" type="submit" disabled={pending}>
            <Send size={17} className="pr-ico" /> {pending ? "Sending..." : "Send message"}
          </button>
        </form>
      )}
    </div>
  );
}
