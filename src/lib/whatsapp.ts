// Same number the current live prototypes use for click-to-chat (wa.me
// links) -- separate from the Twilio WhatsApp Business API sender number
// still unresolved in plan §14 item 1, which is for the automated bot/CRM
// channel, not this direct "message us" link.
export const WHATSAPP_NUMBER = "66650102184";

export function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
