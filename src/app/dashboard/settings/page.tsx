import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import { getPaymentPolicy, getChatPolicy, getSiteStats } from "@/lib/queries/settings";
import { getChatSpend } from "@/lib/queries/chat-spend";
import { saveSettings } from "./actions";

/**
 * Plan §3: "Settings: role-gated -- chatbot toggles (info mode / booking mode
 * -- two separate switches), Stripe mode (deposit % / full / pay-on-arrival)".
 * Admin-only both here (rendering) and in the action (the real gate) --
 * a staff-role member gets the same 404 as an outsider.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  const [payment, chat, spend, stats, { saved }] = await Promise.all([
    getPaymentPolicy(),
    getChatPolicy(),
    getChatSpend(),
    getSiteStats(),
    searchParams,
  ]);

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Settings</h1>
        <p>Changes apply immediately to the live site. Admin only.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Settings updated.
        </div>
      )}

      <form action={saveSettings} className="pr-dash-form">
        <div className="pr-dash-card">
          <h2>Payments</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-field">
              Payment mode
              <select name="mode" defaultValue={payment.mode}>
                <option value="deposit">Deposit online, balance on the day</option>
                <option value="full_prepay">Full payment online</option>
                <option value="pay_on_day">No online payment -- pay on the day</option>
              </select>
            </label>
            <label className="pr-dash-field">
              Deposit (%)
              <input type="number" step="1" min="1" max="100" name="deposit_percent" defaultValue={Math.round(payment.depositRate * 100)} />
              <span className="pr-dash-field-hint">Only used in deposit mode. The client-confirmed policy is 25%.</span>
            </label>
            <label className="pr-dash-field">
              Payment hold (minutes)
              <input type="number" step="1" min="30" max="1439" name="hold_minutes" defaultValue={payment.holdMinutes} />
              <span className="pr-dash-field-hint">
                How long a seat is held while a guest pays. 30 min to 23h59m -- these are Stripe&apos;s own checkout limits.
              </span>
            </label>
            <label className="pr-dash-field">
              Free cancellation window (hours before departure)
              <input type="number" step="1" min="0" max="720" name="cancellation_window_hours" defaultValue={payment.cancellationWindowHours} />
              <span className="pr-dash-field-hint">Guests cancelling earlier than this get their deposit back in full.</span>
            </label>
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Chatbot</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-check">
              <input type="checkbox" name="chat_enabled" defaultChecked={chat.enabled} /> Chat assistant on (the widget on the site)
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="chat_booking_mode" defaultChecked={chat.bookingMode} /> Booking mode (the assistant may propose
              bookings -- guests still confirm, staff still approve)
            </label>
            <label className="pr-dash-field">
              Daily AI budget (tokens)
              <input type="number" step="1000" min="0" name="daily_token_cap" defaultValue={chat.dailyTokenCap} />
              <span className="pr-dash-field-hint">
                When the day&apos;s budget is used up, the assistant politely points guests to WhatsApp instead. Used today:{" "}
                {spend.tokens.toLocaleString()} tokens.
              </span>
            </label>
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Headline stats</h2>
          <p className="pr-dash-field-hint" style={{ marginBottom: "12px" }}>
            Shown across the top of the home page, in the hero, in the reviews header and in the footer -- all from
            these four values, so they can&apos;t disagree with each other. These are business facts nothing here can
            verify (your Google rating lives in Google Business Profile), so please keep them true.
          </p>
          <div className="pr-dash-form">
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Google rating
              <input name="stat_google_rating" defaultValue={stats.googleRating} placeholder="4.9" />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Review count
              <input name="stat_review_count" defaultValue={stats.reviewCount} placeholder="1,200+" />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Travellers served
              <input name="stat_traveler_count" defaultValue={stats.travelerCount} placeholder="5,000+" />
            </label>
            <label className="pr-dash-field" style={{ maxWidth: "220px" }}>
              Operating since (year)
              <input name="stat_since_year" defaultValue={stats.sinceYear} placeholder="2002" />
            </label>
          </div>
        </div>

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
