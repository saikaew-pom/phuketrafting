/**
 * Human labels + badge tones for the raw enum values in `bookings`.
 *
 * Plan §3: "no raw JSON/IDs shown" -- "no_show" and "awaiting_payment" are
 * database values, not words staff should have to read. Shared by the list
 * and detail screens so the two can't drift into calling the same state
 * different things.
 *
 * Every key below matches a value in the table's own CHECK constraints
 * (migrations/0003, 0005) -- checked against the schema, not guessed. Callers
 * still fall back to the raw value, so a future enum addition degrades to
 * "ugly but honest" rather than blank.
 */

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const STATUS_BADGE: Record<string, string> = {
  pending: "pr-dash-badge-warn",
  confirmed: "pr-dash-badge-ok",
  completed: "pr-dash-badge-neutral",
  cancelled: "pr-dash-badge-danger",
  no_show: "pr-dash-badge-danger",
};

export const PAYMENT_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Failed",
};

export const PAYMENT_BADGE: Record<string, string> = {
  awaiting_payment: "pr-dash-badge-warn",
  paid: "pr-dash-badge-ok",
  refunded: "pr-dash-badge-neutral",
  failed: "pr-dash-badge-danger",
};

export const SOURCE_LABEL: Record<string, string> = {
  web: "Website",
  chatbot: "Chat assistant",
  whatsapp: "WhatsApp",
  staff: "Staff",
  ota: "OTA",
  agent: "Agent",
};
