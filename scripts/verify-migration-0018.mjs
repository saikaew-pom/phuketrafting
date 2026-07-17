// Gate test for migration 0018 (addons + booking_addons) and the pricing trust
// anchor in lib/queries/addons.ts (getActiveAddonsByIds) + the money-snapshot
// contract. Exercises the REAL local D1 via wrangler, not a mock:
//   - the two tables + index exist
//   - createAddon's guarded append gives incrementing sort_order
//   - getActiveAddonsByIds' SQL drops deactivated + unknown ids and returns the
//     AUTHORITATIVE D1 price (a client can't inject a price), summing correctly
//   - a booking_addons snapshot survives a later catalog price edit (history is
//     what was paid, not what the catalog now says)
//   - deleteAddon's guard blocks deleting an add-on a booking bought
//
// Run:  node scripts/verify-migration-0018.mjs
// Exits non-zero on any failed assertion. Cleans up its own ZZ- rows.
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--local", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out)[0]?.results ?? [];
}

let failures = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? "ok" : "FAIL"}: ${msg}`);
  if (!cond) failures++;
}

// Mirrors createAddon()'s guarded append: sort_order = MAX(existing)+1.
function append(id, name, price, isActive) {
  d1(
    `INSERT INTO addons (id, name, description, price, is_active, sort_order)
     SELECT '${id}', '${name}', NULL, ${price}, ${isActive}, COALESCE(MAX(sort_order), -1) + 1 FROM addons`
  );
}

try {
  console.log("1. Tables + index exist");
  assert(
    d1("SELECT name FROM sqlite_master WHERE type='table' AND name='addons'").length === 1,
    "addons table present"
  );
  assert(
    d1("SELECT name FROM sqlite_master WHERE type='table' AND name='booking_addons'").length === 1,
    "booking_addons table present"
  );
  assert(
    d1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_booking_addons_booking'").length === 1,
    "idx_booking_addons_booking present"
  );

  console.log("2. Guarded append assigns incrementing sort_order");
  // Neutralise any pre-existing MAX(sort_order) by reading the deltas, not the
  // absolute values -- other rows may exist in a dev DB.
  append("ZZ-a1", "Life jacket", 300, 1);
  append("ZZ-a2", "GoPro rental", 150, 1);
  append("ZZ-a3", "Retired thing", 999, 0); // deactivated
  const orders = d1("SELECT id, sort_order FROM addons WHERE id LIKE 'ZZ-a%' ORDER BY sort_order");
  assert(orders.length === 3, "three ZZ add-ons inserted");
  assert(
    orders[0].sort_order < orders[1].sort_order && orders[1].sort_order < orders[2].sort_order,
    "sort_order strictly increases in insert order"
  );

  console.log("3. getActiveAddonsByIds SQL: active-only, unknown dropped, authoritative price");
  // Exact query shape from getActiveAddonsByIds -- ids are a CLAIM; the price
  // and name come from D1. Pass active a1, active a2, INACTIVE a3, and a bogus id.
  const resolved = d1(
    `SELECT id, name, price FROM addons
      WHERE is_active = 1 AND id IN ('ZZ-a1','ZZ-a2','ZZ-a3','ZZ-nope') ORDER BY sort_order, name`
  );
  assert(resolved.length === 2, "only the two ACTIVE, known ids resolve (a3 deactivated + bogus dropped)");
  assert(
    resolved.some((r) => r.id === "ZZ-a1" && r.price === 300) &&
      resolved.some((r) => r.id === "ZZ-a2" && r.price === 150),
    "each resolved add-on carries its AUTHORITATIVE D1 price, not a client-supplied one"
  );
  const addonsTotal = resolved.reduce((s, r) => s + r.price, 0);
  assert(addonsTotal === 450, `addonsTotal sums to 450 (got ${addonsTotal})`);

  console.log("4. booking_addons snapshot survives a later catalog price edit");
  d1("INSERT INTO bookings (id, type, guest_name, source) VALUES ('ZZ-bk1','tour','ZZ Test','staff')");
  d1(
    `INSERT INTO booking_addons (id, booking_id, addon_id, name_at_booking, price_at_booking)
     VALUES ('ZZ-ba1','ZZ-bk1','ZZ-a1','Life jacket',300)`
  );
  // Staff later raise the catalog price -- the past booking must not change.
  d1("UPDATE addons SET price = 500 WHERE id = 'ZZ-a1'");
  const snap = d1("SELECT price_at_booking FROM booking_addons WHERE id = 'ZZ-ba1'");
  assert(snap[0].price_at_booking === 300, "snapshot stays at 300 even though the catalog is now 500");

  console.log("5. deleteAddon guard: an add-on a booking bought can't be deleted");
  // Mirrors deleteAddon()'s guard exactly.
  d1("DELETE FROM addons WHERE id = 'ZZ-a1' AND NOT EXISTS (SELECT 1 FROM booking_addons WHERE addon_id = 'ZZ-a1')");
  assert(
    d1("SELECT id FROM addons WHERE id = 'ZZ-a1'").length === 1,
    "ZZ-a1 (bought by ZZ-bk1) survives the guarded delete"
  );
  // An add-on nobody bought deletes cleanly.
  d1("DELETE FROM addons WHERE id = 'ZZ-a2' AND NOT EXISTS (SELECT 1 FROM booking_addons WHERE addon_id = 'ZZ-a2')");
  assert(d1("SELECT id FROM addons WHERE id = 'ZZ-a2'").length === 0, "ZZ-a2 (unbought) deletes cleanly");

  console.log("6. Tour-path orphan guard: no booking_addons row without a booking");
  // Mirrors createTourBooking's guarded snapshot INSERT. If the booking INSERT
  // failed on capacity there is no booking row, and this must write nothing
  // (booking_id is a FK -- a stray row would abort the whole batch).
  d1(
    `INSERT INTO booking_addons (id, booking_id, addon_id, name_at_booking, price_at_booking)
     SELECT 'ZZ-orphan','ZZ-missing-booking','ZZ-a1','Life jacket',300
      WHERE EXISTS (SELECT 1 FROM bookings WHERE id = 'ZZ-missing-booking')`
  );
  assert(
    d1("SELECT id FROM booking_addons WHERE id = 'ZZ-orphan'").length === 0,
    "guarded INSERT writes no row when the booking doesn't exist (no orphan)"
  );

  console.log("7. CHECK (price >= 0) rejects a negative catalog price");
  let rejected = false;
  try {
    d1("INSERT INTO addons (id, name, price) VALUES ('ZZ-neg','Sneaky discount',-100)");
  } catch {
    rejected = true;
  }
  assert(rejected, "a negative price is refused by the DB CHECK constraint");
} finally {
  d1("DELETE FROM booking_addons WHERE id LIKE 'ZZ-%'");
  d1("DELETE FROM bookings WHERE id LIKE 'ZZ-%'");
  d1("DELETE FROM addons WHERE id LIKE 'ZZ-%'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll addons gate-test assertions passed.");
