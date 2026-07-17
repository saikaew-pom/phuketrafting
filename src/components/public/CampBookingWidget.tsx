"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Tent, ChevronDown, Calendar, Minus, Plus, Zap, Check, Tag } from "lucide-react";
import { baht, bangkokTodayISO } from "@/lib/format";
import {
  submitCampBooking,
  previewCampPrice,
  getCampAvailability,
  getCampZoneRates,
  type CampBookingFormState,
} from "@/app/[lang]/camp-booking-actions";
import type { AvailableCampUnit } from "@/lib/scheduling";
import type { CampRate } from "@/lib/queries/camping";
import type { PriceBreakdown } from "@/lib/pricing";

declare global {
  interface Window {
    // Widened from (widgetId?: string) to also accept a container element:
    // TypeScript requires every `declare global` copy of this interface to
    // agree, and the two forms on the manage page must reset by container
    // (see ManageBookingRequestForm.tsx). This form is the sole widget on its
    // Reset must target THIS widget by container: the landing page renders
    // three Turnstile widgets, and a bare reset() clears only one. (Audit A4.)
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

export interface CampZoneOption {
  id: string;
  name: string;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const INITIAL_STATE: CampBookingFormState = { status: "idle" };

// Bangkok-today, not UTC -- a bare UTC date is a day behind between 00:00-07:00
// Thailand time, offering a local-yesterday check-in. (Audit A7.)
function todayISO(): string {
  return bangkokTodayISO();
}
function addDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CampBookingWidget({ zones, locale }: { zones: CampZoneOption[]; locale: string }) {
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [rates, setRates] = useState<CampRate[]>([]);
  const [stayType, setStayType] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 1));
  const [units, setUnits] = useState<AvailableCampUnit[]>([]);
  const [campUnitId, setCampUnitId] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [price, setPrice] = useState<PriceBreakdown | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [state, formAction, pending] = useActionState(submitCampBooking, INITIAL_STATE);

  // Same out-of-order-response guards as BookingWidget.tsx (tour path) -- see
  // that file's comment for the full reasoning.
  const ratesRequestId = useRef(0);
  const availabilityRequestId = useRef(0);
  const previewRequestId = useRef(0);

  // Same double-submit guard as BookingWidget.tsx -- see that file's comment
  // for why disabled={pending} alone doesn't close a same-tick double submit.
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) submittingRef.current = false;
  }, [pending]);

  // Fetch this zone's active stay-type rates whenever the zone changes.
  useEffect(() => {
    if (!zoneId) return;
    const requestId = ++ratesRequestId.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStayType("");
    setRates([]);
    getCampZoneRates(zoneId)
      .then((result) => {
        if (requestId !== ratesRequestId.current) return;
        setRates(result);
      })
      .catch((err) => {
        if (requestId !== ratesRequestId.current) return;
        console.error("getCampZoneRates failed", err);
      });
  }, [zoneId]);

  // Fetch available units whenever the zone or date range changes.
  useEffect(() => {
    if (!zoneId || !checkIn || !checkOut || checkOut <= checkIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCampUnitId("");
      setUnits([]);
      return;
    }
    const requestId = ++availabilityRequestId.current;
    setCampUnitId("");
    getCampAvailability(zoneId, checkIn, checkOut)
      .then((result) => {
        if (requestId !== availabilityRequestId.current) return;
        setUnits(result);
      })
      .catch((err) => {
        if (requestId !== availabilityRequestId.current) return;
        console.error("getCampAvailability failed", err);
      });
  }, [zoneId, checkIn, checkOut]);

  // Live price preview on every pricing-relevant change.
  useEffect(() => {
    if (!zoneId || !stayType || !checkIn || !checkOut || checkOut <= checkIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same reasoning as BookingWidget.tsx's identical effect.
      setPrice(null);
      setPriceError(null);
      return;
    }
    const requestId = ++previewRequestId.current;
    setPriceLoading(true);
    previewCampPrice({ zoneId, stayType, checkIn, checkOut, promoCode: promoCode.trim() || null })
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
        console.error("previewCampPrice failed", err);
        setPriceError("Unable to calculate price right now.");
      });
  }, [zoneId, stayType, checkIn, checkOut, promoCode]);

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

  // Turnstile tokens are single-use -- same fix as BookingWidget.tsx. Reset
  // THIS widget by container: the landing page has three Turnstile widgets and
  // a bare reset() clears only one. (Audit A4.)
  useEffect(() => {
    if (state.status === "error" && turnstileRef.current) {
      window.turnstile?.reset(turnstileRef.current);
    }
  }, [state]);

  // Native form reset after a settled action desyncs <select> DOM values from
  // React state -- same fix as BookingWidget.tsx, applied to all three
  // selects here.
  const turnstileRef = useRef<HTMLDivElement>(null);
  const zoneSelectRef = useRef<HTMLSelectElement>(null);
  const stayTypeSelectRef = useRef<HTMLSelectElement>(null);
  const unitSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (zoneSelectRef.current) zoneSelectRef.current.value = zoneId;
    if (stayTypeSelectRef.current) stayTypeSelectRef.current.value = stayType;
    if (unitSelectRef.current) unitSelectRef.current.value = campUnitId;
  }, [state, zoneId, stayType, campUnitId]);

  const nights = checkIn && checkOut && checkOut > checkIn
    ? Math.round((new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86_400_000)
    : 0;

  return (
    <div className="pr-bform pr-bform-card">
      {TURNSTILE_SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      <div className="pr-bform-head">
        <span className="pr-bform-title">Reserve a campsite</span>
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
            if (submittingRef.current) {
              e.preventDefault();
              return;
            }
            submittingRef.current = true;
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="zone_id" value={zoneId} />
          <input type="hidden" name="camp_unit_id" value={campUnitId} />
          <input type="hidden" name="stay_type" value={stayType} />
          <input type="hidden" name="check_in" value={checkIn} />
          <input type="hidden" name="check_out" value={checkOut} />
          <input type="hidden" name="adults" value={adults} />
          {/* Named "children_count", not "children" -- see BookingWidget.tsx's identical comment. */}
          <input type="hidden" name="children_count" value={children} />
          <input type="hidden" name="infants" value={infants} />
          <input type="hidden" name="promo_code" value={promoCode} />

          <label className="pr-field">
            <span className="pr-field-lbl">Zone</span>
            <div className="pr-select-wrap">
              <Tent size={17} className="pr-ico pr-field-ico" />
              <select ref={zoneSelectRef} className="pr-input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pr-ico pr-select-chev" />
            </div>
          </label>

          <div className="pr-field-row">
            <label className="pr-field">
              <span className="pr-field-lbl">Check-in</span>
              <input
                className="pr-input"
                type="date"
                value={checkIn}
                min={todayISO()}
                onChange={(e) => {
                  const next = e.target.value;
                  setCheckIn(next);
                  if (checkOut <= next) setCheckOut(addDaysISO(next, 1));
                }}
                required
              />
            </label>
            <label className="pr-field">
              <span className="pr-field-lbl">Check-out</span>
              <input
                className="pr-input"
                type="date"
                value={checkOut}
                min={addDaysISO(checkIn, 1)}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="pr-field">
            <span className="pr-field-lbl">Stay type</span>
            <div className="pr-select-wrap">
              <Calendar size={17} className="pr-ico pr-field-ico" />
              <select
                ref={stayTypeSelectRef}
                className="pr-input"
                value={stayType}
                onChange={(e) => setStayType(e.target.value)}
                required
              >
                <option value="" disabled>
                  {rates.length === 0 ? "No stay types available" : "Choose a stay type"}
                </option>
                {rates.map((r) => (
                  <option key={r.id} value={r.stay_type}>
                    {r.stay_type} -- from {baht(Math.min(r.price_weekday, r.price_weekend))}/night
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pr-ico pr-select-chev" />
            </div>
          </label>

          <label className="pr-field">
            <span className="pr-field-lbl">Campsite</span>
            <div className="pr-select-wrap">
              <Tent size={17} className="pr-ico pr-field-ico" />
              <select
                ref={unitSelectRef}
                className="pr-input"
                value={campUnitId}
                onChange={(e) => setCampUnitId(e.target.value)}
                required
              >
                <option value="" disabled>
                  {units.length === 0 ? "No campsites open for these dates" : "Choose a campsite"}
                </option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} -- sleeps {u.occupancy}
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
                      : nights > 0
                        ? `${nights} night${nights === 1 ? "" : "s"}`
                        : "Pick your dates to see pricing"}
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

          {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />}

          <button
            className="pr-btn pr-btn-accent pr-btn-block pr-btn-lg"
            type="submit"
            disabled={pending || !campUnitId || !price}
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
