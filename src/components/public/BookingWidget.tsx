"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Mountain, ChevronDown, Calendar, Minus, Plus, Zap, Check, Tag, MapPin, Sparkles } from "lucide-react";
import { baht } from "@/lib/format";
import {
  submitTourBooking,
  previewTourPrice,
  getTourAvailability,
  type BookingFormState,
} from "@/app/[lang]/booking-actions";
import type { AvailableTourSession } from "@/lib/scheduling";
import type { PriceBreakdown } from "@/lib/pricing";
import type { PickupZone } from "@/lib/queries/pickup";

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

export interface BookingTourOption {
  id: string;
  name: string;
  fromPrice: number;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const INITIAL_STATE: BookingFormState = { status: "idle" };

// How far ahead to look for open sessions -- arbitrary but generous window
// for a same-season adventure tour; revisit if staff start scheduling
// further out than this.
const AVAILABILITY_WINDOW_DAYS = 90;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingWidget({
  tours,
  pickupZones,
  locale,
}: {
  tours: BookingTourOption[];
  pickupZones: PickupZone[];
  locale: string;
}) {
  const [tourId, setTourId] = useState(tours[0]?.id ?? "");
  const [sessions, setSessions] = useState<AvailableTourSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pickupZoneId, setPickupZoneId] = useState("");
  const [hotel, setHotel] = useState("");
  const [addonChoice, setAddonChoice] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [price, setPrice] = useState<PriceBreakdown | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [state, formAction, pending] = useActionState(submitTourBooking, INITIAL_STATE);

  // Discards a preview response that's no longer the latest one requested --
  // without this, rapidly changing guest count/date/promo can let an
  // earlier, slower response overwrite a later, faster one's price on
  // screen (classic out-of-order-response race for any "live update as you
  // type" UI backed by a network call per keystroke).
  const previewRequestId = useRef(0);
  const availabilityRequestId = useRef(0);

  // Guards against a real double-submit, which `disabled={pending}` on its
  // own does NOT close: `pending` only flips in the DOM after React commits
  // a render, but two native "submit" events fired in the same tick (a fast
  // double-click/double-tap, or a user mashing Enter) can both reach the
  // form's onSubmit before that commit happens -- confirmed live: two
  // requestSubmit() calls back-to-back created two real bookings and
  // double-claimed capacity before `pending` ever reached the button's
  // `disabled` attribute. This ref is set synchronously, inside the same
  // event dispatch as the first submit, so the second submit sees it
  // immediately -- no render/commit round-trip in between. Same
  // synchronous-guard-via-ref shape as previewRequestId/availabilityRequestId
  // above, just closing a submit race instead of a response-ordering race.
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) submittingRef.current = false;
  }, [pending]);

  // Fetch available sessions whenever the selected tour changes; reset the
  // chosen date since it belonged to the previous tour's session list. The
  // resets below aren't deriving state from props (which could live in
  // render instead) -- they clear stale UI right before the same effect's
  // fetch call, the external-system sync this effect exists for.
  useEffect(() => {
    if (!tourId) return;
    const requestId = ++availabilityRequestId.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId("");
    setSessions([]);
    getTourAvailability(tourId, todayISO(), addDaysISO(AVAILABILITY_WINDOW_DAYS))
      .then((result) => {
        if (requestId !== availabilityRequestId.current) return;
        setSessions(result);
      })
      .catch((err) => {
        if (requestId !== availabilityRequestId.current) return;
        console.error("getTourAvailability failed", err);
      });
  }, [tourId]);

  // Live price preview on every pricing-relevant change.
  useEffect(() => {
    if (!tourId || !sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same reasoning as the availability effect above.
      setPrice(null);
      setPriceError(null);
      return;
    }
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const requestId = ++previewRequestId.current;
    setPriceLoading(true);
    previewTourPrice({
      tourId,
      date: session.date,
      adults,
      children,
      infants,
      pickupZoneId: pickupZoneId || null,
      promoCode: promoCode.trim() || null,
    })
      .then((result) => {
        if (requestId !== previewRequestId.current) return;
        setPriceLoading(false);
        if ("error" in result) {
          setPrice(null);
          setPriceError(result.error);
        } else {
          setPrice(result);
          setPriceError(null);
        }
      })
      .catch((err) => {
        if (requestId !== previewRequestId.current) return;
        setPriceLoading(false);
        console.error("previewTourPrice failed", err);
        setPriceError("Unable to calculate price right now.");
      });
  }, [tourId, sessionId, adults, children, infants, pickupZoneId, promoCode, sessions]);

  // Stripe Checkout is a hosted page on Stripe's own domain, so this is a
  // full document navigation, not a router push. Done in an effect rather
  // than inside the action because a Server Action can't redirect to an
  // external origin. The success message renders for the instant before the
  // browser leaves, and remains the final state for anyone with no payment
  // step (no deposit owed, or Checkout unavailable -- see
  // lib/checkout.ts, which never throws).
  useEffect(() => {
    if (state.status === "success" && state.checkoutUrl) {
      window.location.href = state.checkoutUrl;
    }
  }, [state]);

  // Turnstile tokens are single-use -- a rejected submission (bad Zod field,
  // an already-spent token) must reset the widget or every resubmission
  // attempt replays the dead token and fails forever until a page reload
  // (same fix as EnquiryForm.tsx).
  useEffect(() => {
    if (state.status === "error") {
      window.turnstile?.reset();
    }
  }, [state]);

  // React's <form action={...}> mechanism performs a native form reset
  // after every action settle (success OR error) -- confirmed live: after a
  // FAILED submission, the visible tour/date <select> elements silently
  // desync from React's own tourId/sessionId state. The native reset forces
  // each select's real DOM selectedIndex back to its default (first) option;
  // React's <select> reconciliation only re-touches the DOM when the
  // tracked value prop itself changed since the last render, which it
  // didn't here (the state was never touched by the failed submission), so
  // React skips correcting it -- unlike <input>, which React re-applies
  // unconditionally on every commit. Because both selects are `required`,
  // the desynced DOM value then silently fails constraint validation on the
  // next submit attempt: no error, no re-render, the "submit" event simply
  // never fires. A guest whose FIRST attempt fails for ANY reason (blocked,
  // no_capacity, a rate limit, a Turnstile hiccup) would see "Reserve now"
  // do nothing at all on retry unless they manually re-touch the dropdowns.
  // Forcing the DOM back in sync with React's real state after every settle
  // closes this regardless of which action outcome triggered the reset.
  const tourSelectRef = useRef<HTMLSelectElement>(null);
  const dateSelectRef = useRef<HTMLSelectElement>(null);
  const pickupSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (tourSelectRef.current) tourSelectRef.current.value = tourId;
    if (dateSelectRef.current) dateSelectRef.current.value = sessionId;
    if (pickupSelectRef.current) pickupSelectRef.current.value = pickupZoneId;
  }, [state, tourId, sessionId, pickupZoneId]);

  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  return (
    <div className="pr-bform pr-bform-card">
      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      <div className="pr-bform-head">
        <span className="pr-bform-title">Check availability</span>
        <span className="pr-pill pr-pill-live">
          <span className="pr-dot" />
          Free cancellation
        </span>
      </div>

      {state.status !== "idle" && (
        <p className={"pr-enquiry-status " + (state.status === "success" ? "pr-enquiry-status-success" : "pr-enquiry-status-error")}>
          {state.message}
          {state.status === "success" && state.manageToken && (
            <>
              {" "}
              <a href={`/${locale}/manage/${state.manageToken}`}>View or manage your booking</a>
            </>
          )}
        </p>
      )}

      {state.status !== "success" && (
        <form
          action={formAction}
          onSubmit={(e) => {
            // Synchronous double-submit guard -- see submittingRef's comment
            // above for why `disabled={pending}` alone isn't enough.
            if (submittingRef.current) {
              e.preventDefault();
              return;
            }
            submittingRef.current = true;
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="tour_id" value={tourId} />
          <input type="hidden" name="tour_session_id" value={sessionId} />
          <input type="hidden" name="adults" value={adults} />
          {/* Named "children_count", not "children" -- a form field named
              "children" shadows the inherited Element.children property
              (DOM clobbering: form.children silently returns this input
              instead of the real HTMLCollection of child elements). Native
              form submission (FormData) is unaffected either way, but any
              JS that reads form.children -- devtools, accessibility
              tooling, a future script -- would silently get the wrong
              thing. booking-actions.ts reads this same key via
              formData.get("children_count"). */}
          <input type="hidden" name="children_count" value={children} />
          <input type="hidden" name="infants" value={infants} />
          <input type="hidden" name="pickup_zone_id" value={pickupZoneId} />
          <input type="hidden" name="hotel" value={hotel} />
          <input type="hidden" name="addon_choice" value={addonChoice} />
          <input type="hidden" name="promo_code" value={promoCode} />

          <label className="pr-field">
            <span className="pr-field-lbl">Adventure</span>
            <div className="pr-select-wrap">
              <Mountain size={17} className="pr-ico pr-field-ico" />
              <select ref={tourSelectRef} className="pr-input" value={tourId} onChange={(e) => setTourId(e.target.value)}>
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} -- from {baht(t.fromPrice)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pr-ico pr-select-chev" />
            </div>
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Date</span>
            <div className="pr-select-wrap">
              <Calendar size={17} className="pr-ico pr-field-ico" />
              <select
                ref={dateSelectRef}
                className="pr-input"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
              >
                <option value="" disabled>
                  {sessions.length === 0 ? "No open dates in the next 90 days" : "Choose a date"}
                </option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} -- {s.start_time} ({s.capacity - s.booked_count} seats left)
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pr-ico pr-select-chev" />
            </div>
          </label>

          <div className="pr-field-row">
            <label className="pr-field" style={{ maxWidth: 110 }}>
              <span className="pr-field-lbl">Adults</span>
              <div className="pr-stepper">
                <button type="button" onClick={() => setAdults((n) => Math.max(1, n - 1))} aria-label="Fewer adults">
                  <Minus size={15} className="pr-ico" />
                </button>
                <span className="pr-stepper-val">{adults}</span>
                <button type="button" onClick={() => setAdults((n) => Math.min(20, n + 1))} aria-label="More adults">
                  <Plus size={15} className="pr-ico" />
                </button>
              </div>
            </label>
            <label className="pr-field" style={{ maxWidth: 110 }}>
              <span className="pr-field-lbl">Children</span>
              <div className="pr-stepper">
                <button type="button" onClick={() => setChildren((n) => Math.max(0, n - 1))} aria-label="Fewer children">
                  <Minus size={15} className="pr-ico" />
                </button>
                <span className="pr-stepper-val">{children}</span>
                <button type="button" onClick={() => setChildren((n) => Math.min(20, n + 1))} aria-label="More children">
                  <Plus size={15} className="pr-ico" />
                </button>
              </div>
            </label>
            <label className="pr-field" style={{ maxWidth: 110 }}>
              <span className="pr-field-lbl">Infants</span>
              <div className="pr-stepper">
                <button type="button" onClick={() => setInfants((n) => Math.max(0, n - 1))} aria-label="Fewer infants">
                  <Minus size={15} className="pr-ico" />
                </button>
                <span className="pr-stepper-val">{infants}</span>
                <button type="button" onClick={() => setInfants((n) => Math.min(20, n + 1))} aria-label="More infants">
                  <Plus size={15} className="pr-ico" />
                </button>
              </div>
            </label>
          </div>

          {pickupZones.length > 0 && (
            <label className="pr-field">
              <span className="pr-field-lbl">Pickup (optional)</span>
              <div className="pr-select-wrap">
                <MapPin size={17} className="pr-ico pr-field-ico" />
                <select
                  ref={pickupSelectRef}
                  className="pr-input"
                  value={pickupZoneId}
                  onChange={(e) => setPickupZoneId(e.target.value)}
                >
                  <option value="">No pickup -- I&apos;ll make my own way there</option>
                  {pickupZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} -- {z.fee > 0 ? `+${baht(z.fee)}` : "free"}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pr-ico pr-select-chev" />
              </div>
            </label>
          )}

          {pickupZoneId && (
            <label className="pr-field">
              <span className="pr-field-lbl">Hotel name (for pickup)</span>
              <input
                className="pr-input"
                type="text"
                maxLength={200}
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                placeholder="e.g. Patong Beach Hotel"
              />
            </label>
          )}

          <label className="pr-field">
            <span className="pr-field-lbl">Add-on (optional)</span>
            <div className="pr-select-wrap">
              <Sparkles size={17} className="pr-ico pr-field-ico" />
              <input
                className="pr-input"
                type="text"
                maxLength={60}
                value={addonChoice}
                onChange={(e) => setAddonChoice(e.target.value)}
                placeholder="e.g. ATV combo, elephant sanctuary visit"
              />
            </div>
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Promo code (optional)</span>
            <div className="pr-select-wrap">
              <Tag size={17} className="pr-ico pr-field-ico" />
              <input
                className="pr-input"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="e.g. SUMMER10"
              />
            </div>
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Name</span>
            <input
              className="pr-input"
              type="text"
              name="guest_name"
              required
              maxLength={120}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </label>
          <div className="pr-field-row">
            <label className="pr-field">
              <span className="pr-field-lbl">Email</span>
              <input
                className="pr-input"
                type="email"
                name="guest_email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </label>
            <label className="pr-field">
              <span className="pr-field-lbl">Phone</span>
              <input
                className="pr-input"
                type="tel"
                name="guest_phone"
                maxLength={40}
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </label>
          </div>

          <label className="pr-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              name="consent_marketing"
              checked={consentMarketing}
              onChange={(e) => setConsentMarketing(e.target.checked)}
            />
            <span className="pr-field-lbl" style={{ margin: 0 }}>
              I&apos;m okay receiving occasional offers by email (optional)
            </span>
          </label>

          <div className="pr-bform-total">
            <div>
              <span className="pr-total-lbl">Total</span>
              <span className="pr-total-sub">
                {priceLoading
                  ? "Calculating..."
                  : priceError
                    ? priceError
                    : price?.promoApplied
                      ? `${price.promoApplied.code} applied -- ${baht(price.discountAmount)} off`
                      : selectedSession
                        ? `${adults + children} paying, ${infants} free`
                        : "Pick a date to see pricing"}
              </span>
            </div>
            <span className="pr-total-val">{price ? baht(price.total) : baht(0)}</span>
          </div>

          {/* Plan §4: "The widget, chatbot card, and emails all state the
              split explicitly ('Pay ฿X now, ฿Y on the day')". Gated on the
              same depositAmount the foot's "No upfront payment" reads, so the
              two can never contradict each other -- which they did before
              this gate existed, while a deposit was owed. */}
          {price && price.depositAmount > 0 && price.balanceAmount > 0 && (
            <p className="pr-bform-split">
              Pay {baht(price.depositAmount)} now to reserve, {baht(price.balanceAmount)} on the day.
            </p>
          )}
          {price && price.depositAmount > 0 && price.balanceAmount === 0 && (
            <p className="pr-bform-split">Pay {baht(price.depositAmount)} now to confirm your booking.</p>
          )}

          {TURNSTILE_SITE_KEY && <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

          <button
            className="pr-btn pr-btn-accent pr-btn-block pr-btn-lg"
            type="submit"
            disabled={pending || !sessionId || !price}
          >
            <Zap size={18} className="pr-ico" /> {pending ? "Booking..." : "Reserve now"}
          </button>
          <div className="pr-bform-foot">
            {/* Only true when nothing is actually collected up front. Gated
                on the same depositAmount as the split line above so exactly
                one of the two ever renders. Before a price loads the policy's
                effect is unknown, so assert nothing rather than guess. */}
            {price && price.depositAmount === 0 && (
              <span>
                <Check size={14} className="pr-ico" /> No upfront payment
              </span>
            )}
            <span>
              <Check size={14} className="pr-ico" /> Instant confirmation
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
