// Gate test for migration 0017 (faqs). Exercises the REAL local D1 via
// wrangler: the table exists, the 6 seed rows loaded, and apostrophes survived
// the SQL escaping intact (the one thing a hand-written seed can get wrong).
//
// Run:  node scripts/verify-migration-0017.mjs   (exits non-zero on failure)
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";
function d1(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out)[0]?.results ?? [];
}
let failures = 0;
const assert = (c, m) => {
  console.log(`  ${c ? "ok" : "FAIL"}: ${m}`);
  if (!c) failures++;
};

const tbl = d1("SELECT name FROM sqlite_master WHERE type='table' AND name='faqs'");
assert(tbl.length === 1, "faqs table present");

const active = d1("SELECT COUNT(*) AS n FROM faqs WHERE is_active=1");
assert(active[0].n === 6, "6 active FAQs seeded");

const ordered = d1("SELECT id FROM faqs ORDER BY sort_order LIMIT 1");
assert(ordered[0].id === "faq-experience", "first FAQ by sort_order is faq-experience");

// The escaping check: the answer must contain a real apostrophe, not a doubled
// one or a broken row.
const apos = d1("SELECT answer FROM faqs WHERE id='faq-safety'");
assert(apos.length === 1 && apos[0].answer.includes("We've safely guided"), "apostrophes intact (We've, not We''ve)");
assert(apos.length === 1 && !apos[0].answer.includes("We''ve"), "no doubled apostrophes left in the stored text");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll faqs gate-test assertions passed.");
