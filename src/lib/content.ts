// Static marketing copy for the Landing page -- not stored in D1 because it
// isn't a product/booking record (plan §3 scope: only tours, camp_zones,
// bookings etc. are DB-backed). Ported from the prototype's data.jsx.

export const GALLERY = [
  { publicId: "au7evtgufphh8vmfyaor", label: "White-water rafting" },
  { publicId: "jl7natavcln2ws8no1wa", label: "The rapids" },
  { publicId: "ys6mhzv9nyipx2cbvdjy", label: "ATV jungle run" },
  { publicId: "nefv70opn9cdgw7un7nw", label: "Phang Nga from above" },
  { publicId: "hgpjvzlaamhafxwit0rs", label: "Zipline circuit" },
  { publicId: "wdzm02ghmvru0kshywix", label: "Riverside camp" },
] as const;

export const FAQS = [
  {
    q: "Do I need experience to go rafting?",
    a: "Not at all. Every trip starts with a safety briefing in English and a certified guide rides with each raft. Beginners and families are welcome.",
  },
  {
    q: "Is it safe for kids and older travelers?",
    a: "Yes. We've safely guided families for 20+ years. The Classic Rush and Adventure Combo suit most ages -- message us your group's ages and we'll recommend the right package.",
  },
  {
    q: "How do I get there? Is pickup included?",
    a: "We arrange transfers from Phuket and the surrounding areas. Tell us your hotel on WhatsApp and we'll confirm pickup times and any transfer cost.",
  },
  {
    q: "What should I bring?",
    a: "Just swimwear, a change of clothes and a sense of adventure. We provide all safety gear, and there are hot showers, lockers and changing rooms on site.",
  },
  {
    q: "How do I pay?",
    a: "Book online and pay a 25% deposit to lock in your date -- the rest is due on the day of your adventure. Cancel or reschedule free up to 72 hours before departure and the deposit is refunded in full. Prefer to talk first? Message us on WhatsApp.",
  },
  {
    q: "What if it rains?",
    a: "Rafting runs in most weather -- rain often makes the river even better! In the rare case of unsafe conditions we'll reschedule or refund you in full.",
  },
] as const;

