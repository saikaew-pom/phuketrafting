// Gate test for migration 0015 (payment_expires_at) and the expiry-sweeper's
// new per-booking cutoff (Audit A3). Exercises the REAL local D1 database via
// wrangler, not a mock: asserts the column exists and that the sweep predicate
// selects exactly the rows whose frozen deadline has passed the margin -- and
// never a row whose deadline is still in the future (the money bug this fixes).
//
// Run:  node scripts/verify-migration-0015.mjs
// Exits non-zero on any failed assertion. Cleans up its own ZZTEST- rows.
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";
const MARGIN = 300; // must match SWEEP_MARGIN_SECONDS in expiry-sweeper.ts

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--local", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok: ${msg}`);
  } else {
    console.error(`  FAIL: ${msg}`);
    failures++;
  }
}

try {
  console.log("1. Column exists");
  const cols = d1("PRAGMA table_info(bookings)");
  assert(cols.some((c) => c.name === "payment_expires_at"), "bookings.payment_expires_at present");

  console.log("2. Seed three awaiting_payment bookings with different deadlines");
  // Need a real tour_session_id (FK). Grab any existing session.
  const sess = d1("SELECT id FROM tour_sessions LIMIT 1")[0]?.id;
  if (!sess) throw new Error("no tour_sessions in local D1 to attach test bookings to");

  const now = Math.floor(Date.now() / 1000);
  const rows = [
    // id suffix, payment_expires_at, should the sweep pick it up?
    ["expired", now - MARGIN - 60, true], // deadline well past the margin -> swept
    ["future", now + 3600, false], // deadline an hour away (Stripe page still live) -> NOT swept
    ["null", null, false], // no deadline (no deposit / pre-migration) -> NOT swept
  ];
  for (const [suffix, exp] of rows) {
    const expSql = exp === null ? "NULL" : String(exp);
    d1(
      `INSERT INTO bookings (id, type, tour_session_id, manage_token, status, payment_status, source, guest_name, adults, total, currency, stripe_checkout_session_id, payment_expires_at)
       VALUES ('ZZTEST-${suffix}','tour','${sess}','ZZTOK-${suffix}','pending','awaiting_payment','web','Migration Test',2,6000,'THB','cs_test_${suffix}',${expSql})`
    );
  }

  console.log("3. Sweep predicate (mirrors listExpiredUnpaidBookings) selects only the past-deadline row");
  const cutoff = now - MARGIN;
  const swept = d1(
    `SELECT id FROM bookings
      WHERE status = 'pending' AND payment_status = 'awaiting_payment'
        AND payment_expires_at IS NOT NULL AND payment_expires_at < ${cutoff}
        AND id LIKE 'ZZTEST-%'
      ORDER BY id`
  ).map((r) => r.id);

  assert(swept.includes("ZZTEST-expired"), "past-deadline booking IS swept");
  assert(!swept.includes("ZZTEST-future"), "future-deadline booking (payable page still live) is NOT swept");
  assert(!swept.includes("ZZTEST-null"), "null-deadline booking is NOT swept");
  assert(swept.length === 1, `exactly one row swept (got ${swept.length}: ${swept.join(",")})`);
} finally {
  console.log("4. Cleanup");
  d1("DELETE FROM bookings WHERE id LIKE 'ZZTEST-%'");
  const left = d1("SELECT COUNT(*) AS n FROM bookings WHERE id LIKE 'ZZTEST-%'")[0]?.n;
  console.log(`  test rows remaining: ${left}`);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
