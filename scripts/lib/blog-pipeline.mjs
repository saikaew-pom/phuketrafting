import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared helpers for the blog content pipeline (plan §10). Node-side only:
 * these scripts run on your machine, NOT in the Worker, so they cannot use
 * src/lib/db.ts's getDb() (which needs a request context) or import anything
 * from src/ that reaches getCloudflareContext(). D1 is reached through the
 * wrangler CLI instead -- the same way seed/*.sql is applied.
 */

export const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
export const BLOG_CONTENT_DIR = join(PROJECT_ROOT, "blog-content");
const DB_NAME = "phuket-rafting-db";

/**
 * Runs one read-only query against D1 and returns its rows.
 *
 * `--local` by default: content is drafted against the local database, and
 * generation must never be able to touch production. Pass remote=true only
 * for the import script's explicit, opt-in production run.
 */
export function d1Query(sql, { remote = false } = {}) {
  const args = ["wrangler", "d1", "execute", DB_NAME, remote ? "--remote" : "--local", "--command", sql, "--json"];
  const out = execFileSync("npx", args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  // wrangler prints its banner on stderr and JSON on stdout, but has been
  // known to prefix stdout too -- slice from the first bracket rather than
  // trusting the whole stream to be JSON.
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`No JSON in wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
}

export function d1File(path, { remote = false } = {}) {
  const args = ["wrangler", "d1", "execute", DB_NAME, remote ? "--remote" : "--local", "--file", path];
  return execFileSync("npx", args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Reads a var out of .dev.vars (the same file wrangler dev loads secrets from). */
export function readDevVar(name) {
  const raw = readFileSync(join(PROJECT_ROOT, ".dev.vars"), "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && match[1] === name) return match[2].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * The same live-D1 grounding the chatbot and the dashboard's "write draft"
 * button use (src/lib/chat/grounding.ts, src/lib/blog-ai.ts): every price and
 * distance the model is allowed to state comes from the database, never from
 * its own memory. A published post quoting an invented price is a public,
 * indexed, durable mistake -- worse than a chat reply that scrolls away.
 */
export function buildFacts() {
  const tours = d1Query(
    "SELECT id, name, tagline, distance_km, duration_label, min_group, max_group, includes FROM tours WHERE is_active = 1 ORDER BY sort_order"
  );
  const rates = d1Query("SELECT tour_id, label, min_age, price FROM tour_rates ORDER BY tour_id, min_age");
  const zones = d1Query("SELECT id, name, sleeps_label, amenities FROM camp_zones WHERE is_active = 1 ORDER BY sort_order");
  const campRates = d1Query("SELECT zone_id, stay_type, price_weekday, price_weekend, min_nights FROM camp_rates WHERE is_active = 1");
  const pickups = d1Query(
    "SELECT name, fee, earliest_pickup_time FROM pickup_zones WHERE is_active = 1 ORDER BY fee"
  );
  const policy = d1Query("SELECT value FROM settings WHERE key = 'payment_policy'");

  const tourLines = tours.map((t) => {
    const mine = rates.filter((r) => r.tour_id === t.id);
    const priced = mine.filter((r) => r.price > 0).map((r) => `${r.label ?? `age ${r.min_age}+`} THB ${r.price}`).join(", ");
    const free = mine.filter((r) => r.price === 0).map((r) => r.label ?? `under ${r.min_age + 1}`);
    let includes = [];
    try {
      includes = JSON.parse(t.includes ?? "[]");
    } catch {
      includes = [];
    }
    return [
      `- ${t.name}${t.tagline ? ` (${t.tagline})` : ""}`,
      `  price: ${priced || "ask staff"}${free.length ? ` | free: ${free.join(", ")}` : ""}`,
      `  ${[t.distance_km ? `${t.distance_km} km` : null, t.duration_label].filter(Boolean).join(", ")}`,
      `  includes: ${includes.join(", ") || "ask staff"}`,
      `  group size: ${t.min_group ?? "?"}-${t.max_group ?? "?"}`,
    ].join("\n");
  });

  const zoneLines = zones.map((z) => {
    const mine = campRates.filter((r) => r.zone_id === z.id);
    const from = mine.length ? Math.min(...mine.map((r) => r.price_weekday)) : null;
    const stays = mine.map((r) => r.stay_type).filter(Boolean);
    return `- ${z.name}${z.sleeps_label ? ` (${z.sleeps_label})` : ""}: ${from != null ? `from THB ${from}/night` : "price on request"}${stays.length ? ` | stay types: ${[...new Set(stays)].join(", ")}` : ""}`;
  });

  const pickupLines = pickups.map(
    (p) => `- ${p.name}: ${p.fee > 0 ? `THB ${p.fee}` : "free"}${p.earliest_pickup_time ? `, from ${p.earliest_pickup_time}` : ""}`
  );

  let paymentLine = "Guests pay a deposit online to reserve; the balance is paid on the day.";
  let cancellationHours = 72;
  try {
    const parsed = JSON.parse(policy[0]?.value ?? "{}");
    if (parsed.cancellationWindowHours) cancellationHours = parsed.cancellationWindowHours;
    if (parsed.mode === "deposit" && parsed.depositRate) {
      paymentLine = `Guests pay a ${Math.round(parsed.depositRate * 100)}% deposit online to reserve; the balance is paid on the day.`;
    } else if (parsed.mode === "full_prepay") {
      paymentLine = "Guests pay in full online to reserve.";
    } else if (parsed.mode === "pay_on_day") {
      paymentLine = "No payment is taken online; guests pay on the day.";
    }
  } catch {
    // A malformed settings row must not silently change what a published
    // post claims about payment -- fall back to the documented default,
    // same stance as src/lib/queries/settings.ts's getters.
  }

  return `### Tours
${tourLines.join("\n") || "(none configured)"}

### Camping zones
${zoneLines.join("\n") || "(none configured)"}

### Pickup zones (transfer fees)
${pickupLines.join("\n") || "(none configured)"}

### Payment & cancellation
${paymentLine}
Free cancellation or reschedule up to ${cancellationHours} hours before departure. If we cancel for weather or safety, guests always get a full refund or a free reschedule.`;
}

// ---- Front-matter (plan §10: "front-matter + `### Article`") ----

const ARTICLE_MARKER = "### Article";

export function serializePost(brief, body) {
  const fm = [
    "---",
    `slug: ${brief.slug}`,
    `title: ${JSON.stringify(brief.title)}`,
    `category: ${brief.category}`,
    `excerpt: ${JSON.stringify(brief.excerpt ?? "")}`,
    `author: ${JSON.stringify(brief.author ?? "Phuket Rafting Team")}`,
    `featured: ${brief.featured ? "true" : "false"}`,
    `cover_image_id: ${brief.cover_image_id ?? ""}`,
    // Import leaves posts as drafts unless this is explicitly flipped --
    // plan §10's "human-reviewed" step is a real gate, not a formality, and
    // AI-drafted copy must not be able to reach the public site because
    // someone ran a script.
    `published: ${brief.published ? "true" : "false"}`,
    "---",
    "",
    ARTICLE_MARKER,
    "",
  ].join("\n");
  return `${fm}${body.trim()}\n`;
}

export function parsePost(raw) {
  const text = raw.replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Missing front-matter block (--- ... ---)");

  const front = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        throw new Error(`Malformed quoted value for "${kv[1]}"`);
      }
    }
    front[kv[1]] = value;
  }

  const rest = match[2];
  const markerAt = rest.indexOf(ARTICLE_MARKER);
  if (markerAt === -1) throw new Error(`Missing "${ARTICLE_MARKER}" marker`);
  const body = rest.slice(markerAt + ARTICLE_MARKER.length).trim();
  if (!body) throw new Error("Article body is empty");

  return { front, body };
}
