/**
 * The 10 launch posts (plan §10: "Launch with 2 posts per pillar (10 posts),
 * then 2/month"). Titles come straight from the plan's "Ready ideas" lists.
 *
 * `crossLinks` is explicit rather than left to the model. The model is told
 * to link only these slugs, because a model asked to "link to a related
 * post" will confidently invent a plausible-looking slug that 404s -- the
 * same class of failure as the pickup-zone id it guessed in Phase 6 (it said
 * "patong", the real id was "pickup-patong"). scripts/verify-blog-links.mjs
 * (Phase 7e) is the backstop that proves every link actually resolves.
 *
 * Each post's sibling (same pillar) is always cross-linked, which is what
 * guarantees plan §10's "no orphans" at launch: with 2 posts per pillar,
 * every post is reachable from its sibling, and the detail page's automatic
 * same-category "Read next" block links them again.
 */

/** Money-page anchors that really exist on the Landing page -- verified against the components. */
export const MONEY_PAGES = {
  tours: "/en#tours",
  camping: "/en#camp-book",
};

export const BRIEFS = [
  // ---- P1: White-Water Rafting (the money pillar) ----
  {
    slug: "first-timers-guide-to-rafting-near-phuket",
    title: "The Complete First-Timer's Guide to Rafting Near Phuket",
    category: "rafting",
    featured: true,
    angle:
      "A calm, practical walkthrough for someone who has never rafted: what the day actually looks like from hotel pickup to the last rapid, what's provided vs what to bring, how the guides work, and how to pick a package. Reassure without over-promising.",
    crossLinks: ["is-rafting-in-phuket-safe"],
    moneyPage: "tours",
  },
  {
    slug: "is-rafting-in-phuket-safe",
    title: "Is White-Water Rafting in Phuket Safe? 20 Years of Answers",
    category: "rafting",
    featured: false,
    angle:
      "An honest answer to the question every traveler asks first. Cover what makes a trip safe (guides, equipment, briefing, reading the river), be straight that it is an adventure activity with real risk, and be explicit that health/medical/pregnancy questions go to the team rather than being answered here.",
    crossLinks: ["first-timers-guide-to-rafting-near-phuket"],
    moneyPage: "tours",
  },

  // ---- P2: Jungle Adventures Beyond the Raft ----
  {
    slug: "atv-jungle-trails-what-the-ride-is-really-like",
    title: "ATV Jungle Trails: What the Ride Is Really Like",
    category: "jungle-adventures",
    featured: false,
    angle:
      "What the ATV add-on actually involves -- the terrain, the pace, how long you're on the machine, what it feels like for someone who has never driven one. Concrete, not hype.",
    crossLinks: ["ziplining-through-phang-nga-rainforest"],
    moneyPage: "tours",
  },
  {
    slug: "ziplining-through-phang-nga-rainforest",
    title: "Ziplining Through Phang Nga Rainforest: A Course Breakdown",
    category: "jungle-adventures",
    featured: false,
    angle:
      "Walk through the zipline circuit that's included in the packages: what the platforms are like, what the harness/briefing process is, and what someone nervous about heights should know.",
    crossLinks: ["atv-jungle-trails-what-the-ride-is-really-like"],
    moneyPage: "tours",
  },

  // ---- P3: Trip Planning & Logistics ----
  {
    slug: "getting-from-phuket-to-phang-nga-rafting",
    title: "How to Get from Patong, Kata or Karon to Phang Nga Rafting",
    category: "trip-planning",
    featured: false,
    angle:
      "A practical pickup and transfer guide. Use the real pickup zones and their real fees and earliest pickup times from the facts. Explain how transfers are arranged and what to tell us when booking.",
    crossLinks: ["what-phuket-adventure-tours-cost"],
    moneyPage: "tours",
  },
  {
    slug: "what-phuket-adventure-tours-cost",
    title: "What Do Phuket Adventure Tours Actually Cost in 2026?",
    category: "trip-planning",
    featured: true,
    angle:
      "An honest pricing guide using our real prices from the facts. Explain what's included in the price, how the deposit works, and why street-agent pricing differs. Never invent a competitor's price -- talk only about what we charge and what it covers.",
    crossLinks: ["getting-from-phuket-to-phang-nga-rafting"],
    moneyPage: "tours",
  },

  // ---- P4: Riverside Camping & Glamping ----
  {
    slug: "glamping-in-phang-nga-zones-and-whats-included",
    title: "Glamping in Phang Nga: The Zones, the Tents and What's Included",
    category: "camping",
    featured: false,
    angle:
      "Introduce the riverside camping zones using their real names, sleeps labels and real nightly prices from the facts. Help a reader work out which zone suits them.",
    crossLinks: ["raft-all-day-sleep-by-the-river"],
    moneyPage: "camping",
  },
  {
    slug: "raft-all-day-sleep-by-the-river",
    title: "Raft All Day, Sleep by the River: The Overnight Combo",
    category: "camping",
    featured: false,
    angle:
      "What an overnight stay combined with a rafting day is like, hour by hour -- arrival, the river, evening at camp, the night, the morning after.",
    crossLinks: ["glamping-in-phang-nga-zones-and-whats-included"],
    moneyPage: "camping",
  },

  // ---- P5: Phang Nga Nature, Culture & Responsible Travel ----
  {
    slug: "song-phraek-river-ecosystem",
    title: "The Song Phraek River: The Ecosystem You're Paddling Through",
    category: "nature-culture",
    featured: false,
    angle:
      "The river and rainforest as a living place -- what grows there, what lives there, how the seasons change it. Educational and specific to Phang Nga. Do not invent species lists you can't support; write about the landscape in terms a guide would actually use.",
    crossLinks: ["how-local-guides-read-the-river"],
    moneyPage: "tours",
  },
  {
    slug: "how-local-guides-read-the-river",
    title: "How Local Guides Read the River: 20 Years of Knowledge",
    category: "nature-culture",
    featured: false,
    angle:
      "The craft behind the job: how guides judge water level, pick lines, and decide when conditions mean rescheduling. Ties directly to our weather/safety cancellation promise -- a full refund or a free reschedule when we call it off.",
    crossLinks: ["song-phraek-river-ecosystem"],
    moneyPage: "tours",
  },
];
