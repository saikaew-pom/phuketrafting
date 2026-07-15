"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Send } from "lucide-react";
import { submitWaivers, type WaiverFormState } from "@/app/[lang]/manage-actions";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Defined here, not exported from manage-actions.ts -- a "use server" file
// may only export async functions, same reasoning as EnquiryForm.tsx's
// identical INITIAL_STATE constant.
const INITIAL_STATE: WaiverFormState = { status: "idle" };

export interface WaiverRow {
  name: string;
  age: string;
  health: string;
  signature: string;
}

export function WaiverForm({
  manageToken,
  lang,
  participantCount,
  initialRows,
  waiverHref,
}: {
  manageToken: string;
  lang: string;
  participantCount: number;
  initialRows: WaiverRow[];
  waiverHref: string;
}) {
  const boundAction = submitWaivers.bind(null, manageToken, lang);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL_STATE);

  // Every field is controlled, for the reason ManageBookingRequestForm.tsx
  // documents at length: React's <form action={...}> does a native form reset
  // after every action settle, INCLUDING a failed one. This form is the worst
  // place in the app to hit that -- a family of six has just typed six names,
  // ages, health declarations and signatures, and a single expired Turnstile
  // token or a rejected age would silently wipe all of it. (No ref-forced
  // resync needed here, unlike that form's radios: React does force a
  // controlled text <input>/<textarea>'s DOM value back on every commit.)
  // Seeded from the server's copy on mount and owned locally from then on.
  // No resync-from-initialRows effect: on a successful submit these values
  // ARE what just went into D1 (this token is the only way to write them), so
  // there is nothing to reconcile -- the server's re-rendered "N of M signed"
  // line above this form is the part that needs to be fresh, and
  // revalidatePath in submitWaivers handles that.
  const [rows, setRows] = useState<WaiverRow[]>(initialRows);

  // Reset THIS form's widget by container, and on every settle -- not
  // `window.turnstile.reset()` on error only, which is what the other public
  // forms do and what this form originally copied. Two things break that here:
  //
  // 1. This is the only page in the app with TWO Turnstile widgets (this form
  //    plus ManageBookingRequestForm below it). A no-argument reset() does not
  //    throw and does not reset "all" -- it resets a single widget, the
  //    last-rendered one, which is the OTHER form's. This form's spent token
  //    would never be cleared, so the guest could never recover from an error.
  // 2. Turnstile tokens are single-use, and unlike enquiry/booking this form
  //    is explicitly built to be submitted more than once per page load ("You
  //    can update them below if anything changes" -- a guest fixing a typo).
  //    Resetting only on error leaves a spent token after a SUCCESSFUL submit,
  //    so the correction submit fails "couldn't verify you're human" with no
  //    way out but a manual reload.
  const turnstileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle" && turnstileRef.current) {
      window.turnstile?.reset(turnstileRef.current);
    }
  }, [state]);

  const update = (i: number, field: keyof WaiverRow, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

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

      <form action={formAction}>
        {Array.from({ length: participantCount }).map((_, i) => (
          <fieldset key={i} style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <legend style={{ padding: "0 6px" }}>Participant {i + 1}</legend>

            <label className="pr-field">
              <span className="pr-field-lbl">Full name</span>
              <input
                className="pr-input"
                type="text"
                name={`name_${i}`}
                required
                minLength={2}
                maxLength={120}
                value={rows[i]?.name ?? ""}
                onChange={(e) => update(i, "name", e.target.value)}
              />
            </label>

            <label className="pr-field">
              <span className="pr-field-lbl">Age</span>
              <input
                className="pr-input"
                type="number"
                name={`age_${i}`}
                required
                min={0}
                max={120}
                value={rows[i]?.age ?? ""}
                onChange={(e) => update(i, "age", e.target.value)}
              />
            </label>

            <label className="pr-field">
              <span className="pr-field-lbl">
                Health conditions we should know about (heart condition, back/spine issue, pregnancy, recent surgery
                -- leave blank if none)
              </span>
              <textarea
                className="pr-input"
                name={`health_${i}`}
                maxLength={1000}
                rows={2}
                value={rows[i]?.health ?? ""}
                onChange={(e) => update(i, "health", e.target.value)}
              />
            </label>

            <label className="pr-field">
              <span className="pr-field-lbl">
                Signature -- type this participant&apos;s full name to sign (a parent or guardian signs for anyone
                under 18)
              </span>
              <input
                className="pr-input"
                type="text"
                name={`signature_${i}`}
                required
                minLength={2}
                maxLength={120}
                value={rows[i]?.signature ?? ""}
                onChange={(e) => update(i, "signature", e.target.value)}
              />
            </label>
          </fieldset>
        ))}

        <p>
          By signing, each participant (or their guardian) confirms they have read and agree to the{" "}
          <a href={waiverHref} target="_blank" rel="noreferrer">
            Assumption of Risk &amp; Liability Waiver
          </a>
          , and that the health information above is accurate.
        </p>

        {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

        <button className="pr-btn pr-btn-accent pr-btn-block" type="submit" disabled={pending}>
          <Send size={17} className="pr-ico" /> {pending ? "Saving..." : "Sign waivers"}
        </button>
      </form>
    </div>
  );
}
