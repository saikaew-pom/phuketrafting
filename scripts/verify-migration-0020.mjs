// Gate test for migration 0020 (tour_categories + tours.category_id/
// show_on_home/booking_mode) and lib/queries/tour-categories.ts semantics.
// Exercises the REAL local D1:
//   - table + new columns exist
//   - the backfill is correct (every tour in "Rafting", B1/B2/B3 on the home
//     page exactly as PRIMARY_TOUR_IDS had them, all booking_mode 'instant')
//   - the booking_mode CHECK rejects a bad value
//   - the category_id FK rejects an unknown category
//   - deleteTourCategory is blocked while a tour is assigned to it
//   - createTourCategory appends (sort_order = MAX+1); an empty one deletes
//
// Run:  node scripts/verify-migration-0020.mjs
// Exits non-zero on any failed assertion. Cleans up its own ZZ- rows.
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
function assert(cond, msg) {
  console.log(`  ${cond ? "ok" : "FAIL"}: ${msg}`);
  if (!cond) failures++;
}
function throws(sql, label) {
  try {
    d1(sql);
    assert(false, `${label} (expected the DB to reject it)`);
  } catch {
    assert(true, label);
  }
}

try {
  console.log("1. Table + new columns exist");
  assert(d1("SELECT name FROM sqlite_master WHERE type='table' AND name='tour_categories'").length === 1, "tour_categories table present");
  const cols = d1("SELECT name FROM pragma_table_info('tours')").map((r) => r.name);
  assert(["category_id", "show_on_home", "booking_mode"].every((c) => cols.includes(c)), "tours has category_id, show_on_home, booking_mode");

  console.log("2. Backfill matches the old PRIMARY_TOUR_IDS behaviour");
  const rafting = d1("SELECT id FROM tour_categories WHERE id='cat-rafting'");
  assert(rafting.length === 1, "default 'Rafting & Ziplines' category exists");
  const uncat = d1("SELECT COUNT(*) AS n FROM tours WHERE category_id IS NULL")[0].n;
  assert(uncat === 0, "every existing tour was assigned a category");
  const home = d1("SELECT id FROM tours WHERE show_on_home=1 ORDER BY id").map((r) => r.id);
  assert(
    home.length === 3 && home.includes("tour-b1") && home.includes("tour-b2") && home.includes("tour-b3"),
    "exactly tour-b1/b2/b3 are flagged onto the homepage"
  );
  const modes = d1("SELECT DISTINCT booking_mode AS m FROM tours").map((r) => r.m);
  assert(modes.length === 1 && modes[0] === "instant", "all tours default to booking_mode 'instant'");

  console.log("3. booking_mode CHECK rejects a bad value");
  throws(
    "INSERT INTO tours (id, slug, name, category_id, booking_mode) VALUES ('ZZ-badmode','zz-badmode','ZZ','cat-rafting','teleport')",
    "a booking_mode outside instant/enquire is refused"
  );

  console.log("4. category_id FK rejects an unknown category");
  throws(
    "INSERT INTO tours (id, slug, name, category_id) VALUES ('ZZ-badcat','zz-badcat','ZZ','cat-does-not-exist')",
    "a tour pointing at a non-existent category is refused"
  );

  console.log("5. deleteTourCategory is blocked while a tour is assigned");
  // Mirrors deleteTourCategory's guard exactly. cat-rafting has all the tours.
  d1("DELETE FROM tour_categories WHERE id='cat-rafting' AND NOT EXISTS (SELECT 1 FROM tours WHERE category_id='cat-rafting')");
  assert(d1("SELECT id FROM tour_categories WHERE id='cat-rafting'").length === 1, "cat-rafting survives the guarded delete (has tours)");

  console.log("6. createTourCategory appends; an empty category deletes cleanly");
  const maxBefore = d1("SELECT COALESCE(MAX(sort_order),-1) AS m FROM tour_categories")[0].m;
  d1(
    `INSERT INTO tour_categories (id, slug, name, sort_order)
     SELECT 'ZZ-cat','zz-cat','ZZ Islands', COALESCE(MAX(sort_order),-1)+1 FROM tour_categories`
  );
  assert(d1("SELECT sort_order FROM tour_categories WHERE id='ZZ-cat'")[0].sort_order === maxBefore + 1, "new category appended at MAX+1");
  d1("DELETE FROM tour_categories WHERE id='ZZ-cat' AND NOT EXISTS (SELECT 1 FROM tours WHERE category_id='ZZ-cat')");
  assert(d1("SELECT id FROM tour_categories WHERE id='ZZ-cat'").length === 0, "empty category deletes cleanly");
} finally {
  d1("DELETE FROM tours WHERE id LIKE 'ZZ-%'");
  d1("DELETE FROM tour_categories WHERE id='ZZ-cat'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll tour-categories gate-test assertions passed.");
