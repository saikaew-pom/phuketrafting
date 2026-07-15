"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Send } from "lucide-react";
import { requestBookingChange, type ManageRequestFormState } from "@/app/[lang]/manage-actions";

declare global {
  interface Window {
    turnstile?: { reset: (widgetId?: string) => void };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Defined here, not exported from manage-actions.ts -- a "use server" file
// may only export async functions, same reasoning as EnquiryForm.tsx's
// identical INITIAL_STATE constant.
const INITIAL_STATE: ManageRequestFormState = { status: "idle" };

export function ManageBookingRequestForm({ manageToken }: { manageToken: string }) {
  const boundAction = requestBookingChange.bind(null, manageToken);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);

  // Controlled state + a forced DOM resync below -- confirmed live: React's
  // <form action={...}> mechanism does a native form reset after EVERY
  // action settle, including a FAILED one (same root cause documented at
  // length in BookingWidget.tsx, which hit this for <select>). That reset
  // silently wiped a guest's typed message and snapped the radio group back
  // to "Reschedule" after any transient failure (stale Turnstile token, rate
  // limit, a Zod rejection) -- a guest who picked "Cancel", typed a reason,
  // hit one hiccup, and retried without re-noticing the radio would submit
  // the wrong request type with their message silently gone.
  //
  // Controlled `value` alone fixes the textarea (confirmed live: React does
  // force a controlled <textarea>/<input type="text">'s DOM value back on
  // every commit, same as BookingWidget.tsx's plain <input>s). It does NOT
  // fix the radios the same way -- confirmed live: unlike text `value`,
  // React does not unconditionally rewrite a controlled radio's `checked` on
  // every commit; it only touches the DOM when the tracked prop actually
  // changed since the last render, which it hadn't here (requestType was
  // "cancel" both before and after the failed submit). Same failure shape as
  // BookingWidget.tsx's <select> desync, just one micro-behavior further
  // than that comment's own "unlike <select>, <input> re-applies
  // unconditionally" claim turned out to cover -- so this needs the same
  // ref-forced resync fix, applied to the radios specifically.
  const [requestType, setRequestType] = useState<"reschedule" | "cancel">("reschedule");
  const [message, setMessage] = useState("");
  const rescheduleRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rescheduleRef.current) rescheduleRef.current.checked = requestType === "reschedule";
    if (cancelRef.current) cancelRef.current.checked = requestType === "cancel";
  }, [state, requestType]);

  // Same stale-token reset as EnquiryForm.tsx -- Turnstile tokens are
  // single-use, so a rejected submission must reset the widget before retry.
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
          <label className="pr-field" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                ref={rescheduleRef}
                type="radio"
                name="request_type"
                value="reschedule"
                checked={requestType === "reschedule"}
                onChange={() => setRequestType("reschedule")}
                required
              />{" "}
              Reschedule
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                ref={cancelRef}
                type="radio"
                name="request_type"
                value="cancel"
                checked={requestType === "cancel"}
                onChange={() => setRequestType("cancel")}
                required
              />{" "}
              Cancel
            </span>
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Anything we should know? (preferred new date, reason, etc. -- optional)</span>
            <textarea
              className="pr-input"
              name="message"
              maxLength={1000}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {TURNSTILE_SITE_KEY && <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

          <button className="pr-btn pr-btn-accent pr-btn-block" type="submit" disabled={pending}>
            <Send size={17} className="pr-ico" /> {pending ? "Sending..." : "Send request"}
          </button>
        </form>
      )}
    </div>
  );
}
