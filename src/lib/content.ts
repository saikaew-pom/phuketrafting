// Static marketing copy for the Landing page -- not stored in D1 because it
// isn't a product/booking record (plan §3 scope: only tours, camp_zones,
// bookings etc. are DB-backed). Ported from the prototype's data.jsx.

export const WHY = [
  {
    icon: "ShieldCheck",
    title: "20+ years, zero compromise",
    text: "Phang Nga's most experienced operator since 2002. Certified guides supervise every group.",
  },
  {
    icon: "ShowerHead",
    title: "Hot showers & clean facilities",
    text: "Real changing rooms, hot showers and lockers -- you leave fresh, not muddy.",
  },
  {
    icon: "HardHat",
    title: "Top-grade safety gear",
    text: "Helmets, vests and equipment inspected before every trip. Safety briefing in English.",
  },
  {
    icon: "Users",
    title: "5,000+ happy travelers",
    text: "Families, couples and backpackers -- rated 4.9★ across 1,200 reviews.",
  },
  {
    icon: "Leaf",
    title: "Pristine jungle setting",
    text: "Real rainforest rapids in Phang Nga, kept clean and protected -- not a crowded tourist trap.",
  },
  {
    icon: "Headset",
    title: "Easy WhatsApp booking",
    text: "Message us and we'll confirm in minutes. Flexible dates, friendly humans, no call centers.",
  },
] as const;

export const STEPS = [
  {
    n: "01",
    icon: "MousePointerClick",
    title: "Pick your adventure",
    text: "Choose the package that fits your crew and your appetite for thrills.",
  },
  {
    n: "02",
    icon: "CalendarCheck",
    title: "Book in seconds",
    text: "Reserve your date on WhatsApp -- instant confirmation, pay on the day.",
  },
  {
    n: "03",
    icon: "Bus",
    title: "Get picked up",
    text: "We arrange transfers from Phuket & Khao Lak. Just be ready with a smile.",
  },
  {
    n: "04",
    icon: "Waves",
    title: "Go wild",
    text: "Raft, zip and ride through the jungle with pros watching your back.",
  },
] as const;

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

export const PR_STATS = [
  { value: "4.9★", label: "Google rating" },
  { value: "1,200+", label: "Reviews" },
  { value: "5,000+", label: "Travelers" },
  { value: "Since 2002", label: "20+ years" },
] as const;
