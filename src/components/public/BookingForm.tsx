"use client";

import { useState } from "react";
import { Mountain, ChevronDown, Calendar, Minus, Plus, Zap, Check } from "lucide-react";
import { baht } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";

export interface BookingTourOption {
  id: string;
  name: string;
  fromPrice: number;
}

export function BookingForm({
  tours,
  variant = "card",
}: {
  tours: BookingTourOption[];
  variant?: "card" | "modal";
}) {
  const [tourId, setTourId] = useState(tours[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(2);

  const tour = tours.find((t) => t.id === tourId) ?? tours[0];
  const total = (tour?.fromPrice ?? 0) * guests;
  const minDate = new Date().toISOString().split("T")[0];

  function submit() {
    if (!tour) return;
    const msg = `Hi Phuket Rafting! I'd like to reserve:\n\n• Tour: ${tour.name}\n• Date: ${
      date || "flexible"
    }\n• Guests: ${guests}\n• Estimated total: ${baht(total)}\n\nPlease confirm availability. Thank you!`;
    window.open(waLink(msg), "_blank");
  }

  return (
    <div className={"pr-bform pr-bform-" + variant}>
      <div className="pr-bform-head">
        <span className="pr-bform-title">Check availability</span>
        <span className="pr-pill pr-pill-live">
          <span className="pr-dot" />
          Free to reserve
        </span>
      </div>

      <label className="pr-field">
        <span className="pr-field-lbl">Adventure</span>
        <div className="pr-select-wrap">
          <Mountain size={17} className="pr-ico pr-field-ico" />
          <select className="pr-input" value={tourId} onChange={(e) => setTourId(e.target.value)}>
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} -- from {baht(t.fromPrice)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pr-ico pr-select-chev" />
        </div>
      </label>

      <div className="pr-field-row">
        <label className="pr-field">
          <span className="pr-field-lbl">Date</span>
          <div className="pr-select-wrap">
            <Calendar size={17} className="pr-ico pr-field-ico" />
            <input
              type="date"
              className="pr-input"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </label>
        <label className="pr-field" style={{ maxWidth: 132 }}>
          <span className="pr-field-lbl">Guests</span>
          <div className="pr-stepper">
            <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer guests">
              <Minus size={15} className="pr-ico" />
            </button>
            <span className="pr-stepper-val">{guests}</span>
            <button type="button" onClick={() => setGuests((g) => Math.min(20, g + 1))} aria-label="More guests">
              <Plus size={15} className="pr-ico" />
            </button>
          </div>
        </label>
      </div>

      <div className="pr-bform-total">
        <div>
          <span className="pr-total-lbl">Total</span>
          <span className="pr-total-sub">
            {guests} × {baht(tour?.fromPrice ?? 0)}
          </span>
        </div>
        <span className="pr-total-val">{baht(total)}</span>
      </div>

      <button className="pr-btn pr-btn-accent pr-btn-block pr-btn-lg" onClick={submit}>
        <Zap size={18} className="pr-ico" /> Reserve on WhatsApp
      </button>
      <div className="pr-bform-foot">
        <span>
          <Check size={14} className="pr-ico" /> No upfront payment
        </span>
        <span>
          <Check size={14} className="pr-ico" /> Instant reply
        </span>
      </div>
    </div>
  );
}
