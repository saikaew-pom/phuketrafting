"use client";

import { useState } from "react";
import { Check, Minus, LayoutGrid, X } from "lucide-react";
import { baht } from "@/lib/format";
import type { TourCard } from "@/components/public/Tours";

/**
 * The real "Compare all packages" (plan §3: "tours, package tiers (B1-B6)
 * with the comparison-table fields").
 *
 * The button with this label used to be a WhatsApp link -- it opened a chat
 * saying "can you send me all your packages and prices?", i.e. it asked staff
 * to do by hand the comparison the site already had every field for. Every
 * value below comes from D1 via the same TourCard the grid renders, so it
 * cannot disagree with the cards above it, and editing a tour in the
 * dashboard updates the table.
 *
 * The rows are the fields guests actually choose between: price, distance,
 * duration, group size, and what's included. `includes` is a free-text list
 * per tour, so the feature rows are the UNION of every tour's items -- a tick
 * where a tour has it, a dash where it doesn't. That's what makes it a
 * comparison rather than six lists side by side.
 */
export function CompareTable({ tours }: { tours: TourCard[] }) {
  const [open, setOpen] = useState(false);

  if (tours.length === 0) return null;

  // Union of every tour's inclusions, first-seen order -- stable and
  // dashboard-driven, no hardcoded feature list to drift.
  const features: string[] = [];
  for (const t of tours) {
    for (const h of t.highlights) if (!features.includes(h)) features.push(h);
  }

  return (
    <>
      <button type="button" className="pr-btn pr-btn-dark pr-btn-lg" onClick={() => setOpen(true)}>
        <LayoutGrid size={17} className="pr-ico" /> Compare all packages
      </button>

      {open && (
        <div className="pr-compare-overlay" role="dialog" aria-modal="true" aria-label="Compare packages">
          <div className="pr-compare-panel">
            <div className="pr-compare-head">
              <h3>Compare packages</h3>
              <button type="button" className="pr-compare-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={20} className="pr-ico" />
              </button>
            </div>

            <div className="pr-compare-scroll">
              <table className="pr-compare-table">
                <thead>
                  <tr>
                    <th></th>
                    {tours.map((t) => (
                      <th key={t.id}>
                        {t.name}
                        {t.badge && <span className="pr-compare-badge">{t.badge}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Price from</th>
                    {tours.map((t) => (
                      <td key={t.id}>
                        <strong>{baht(t.fromPrice)}</strong> / person
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Duration</th>
                    {tours.map((t) => (
                      <td key={t.id}>{t.durationLabel ?? "--"}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Group size</th>
                    {tours.map((t) => (
                      <td key={t.id}>{t.groupLabel ?? "--"}</td>
                    ))}
                  </tr>
                  {features.map((f) => (
                    <tr key={f}>
                      <th>{f}</th>
                      {tours.map((t) => (
                        <td key={t.id}>
                          {t.highlights.includes(f) ? (
                            <Check size={16} className="pr-ico pr-compare-yes" />
                          ) : (
                            <Minus size={16} className="pr-ico pr-compare-no" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th></th>
                    {tours.map((t) => (
                      <td key={t.id}>
                        {/* Closes the dialog first: the hash drives
                            BookingWidget's preselect, and leaving a fixed
                            overlay on top of the form it just scrolled to
                            would hide the thing the guest asked for. */}
                        <a className="pr-btn pr-btn-accent" href={`#book-${t.id}`} onClick={() => setOpen(false)}>
                          Book
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
