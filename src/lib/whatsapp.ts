// Same number the current live prototypes use for click-to-chat (wa.me
// links) -- separate from the Twilio WhatsApp Business API sender number
// still unresolved in plan §14 item 1, which is for the automated bot/CRM
// channel, not this direct "message us" link.
export const WHATSAPP_NUMBER = "66650102184";

export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/**
 * Staff messaging a specific GUEST, not the business's own click-to-chat
 * number above -- used by the dashboard's "Message on WhatsApp" button.
 * guest_phone is free text with no format validation anywhere upstream
 * (booking-actions.ts's Zod schema only checks length), so this can't be a
 * real phone-number parser: it strips everything but digits, then assumes a
 * leading "0" is Thai local format and swaps it for the +66 country code,
 * since that's the single most common shape staff will see for a
 * Thailand-based business. wa.me shows the resolved number before sending,
 * so a wrong guess is visibly correctable by staff, not a silent misfire.
 */
export function guestWaLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? `66${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}
