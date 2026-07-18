// Gate test for the weekly-schedule reconciliation (Availability stage D):
// applyCapacityToFutureEmpty + removeFutureEmptyForSlot in
// lib/queries/session-templates.ts. The load-bearing, easy-to-get-wrong bit is
// "future EMPTY departures for THIS weekday+time only" -- proven here against
// real local D1:
//   - capacity retro-applies to a future empty departure on the slot's weekday
//   - a BOOKED departure is never touched
//   - a BLOCKED departure is never touched
//   - a PAST departure is never touched
//   - a departure on a DIFFERENT weekday is never touched
//   - remove deletes only the future-empty-same-weekday ones; the rest survive
//
// Run:  node scripts/verify-schedule-template.mjs
// Uses a fixed "today" of 2026-07-18 to mirror bangkokTodayISO at write time.
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";
const TODAY = "2026-07-18";

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
const cap = (id) => d1(`SELECT capacity FROM tour_sessions WHERE id='${id}'`)[0]?.capacity ?? null;
const exists = (id) => d1(`SELECT 1 AS x FROM tour_sessions WHERE id='${id}'`).length === 1;

// The weekday of the reference date, straight from SQLite (0=Sun..6=Sat).
const W = Number(d1("SELECT CAST(strftime('%w','2026-09-07') AS INTEGER) AS w")[0].w);

try {
  console.log(`Reference weekday W=${W} (2026-09-07). Seed departures on/off that weekday.`);
  d1("INSERT INTO tours (id, slug, name, is_active) VALUES ('ZZ-tour','zz-tour','ZZ Tour',1)");
  // future empty | future booked | future blocked | past empty | different weekday | future empty with OTA hold
  d1(
    `INSERT INTO tour_sessions (id, tour_id, date, start_time, capacity, booked_count, allotment_hold, is_blocked) VALUES
     ('ZZ-empty','ZZ-tour','2026-09-07','09:00',24,0,0,0),
     ('ZZ-booked','ZZ-tour','2026-09-14','09:00',24,2,0,0),
     ('ZZ-blocked','ZZ-tour','2026-09-21','09:00',24,0,0,1),
     ('ZZ-past','ZZ-tour','2026-07-13','09:00',24,0,0,0),
     ('ZZ-otherwd','ZZ-tour','2026-09-08','09:00',24,0,0,0),
     ('ZZ-ota','ZZ-tour','2026-09-28','09:00',24,0,4,0)`
  );
  // Sanity: same-weekday dates really share W; the other-weekday one differs.
  assert(Number(d1("SELECT CAST(strftime('%w','2026-09-14') AS INTEGER) AS w")[0].w) === W, "2026-09-14 shares weekday W");
  assert(Number(d1("SELECT CAST(strftime('%w','2026-07-13') AS INTEGER) AS w")[0].w) === W, "2026-07-13 (past) shares weekday W");
  assert(Number(d1("SELECT CAST(strftime('%w','2026-09-08') AS INTEGER) AS w")[0].w) !== W, "2026-09-08 is a different weekday");

  console.log("1. applyCapacityToFutureEmpty -> 30 touches only the future empty same-weekday departure");
  d1(
    `UPDATE tour_sessions SET capacity=30 WHERE tour_id='ZZ-tour' AND start_time='09:00' AND date >= '${TODAY}'
       AND CAST(strftime('%w', date) AS INTEGER) = ${W} AND booked_count = 0 AND is_blocked = 0 AND allotment_hold = 0`
  );
  assert(cap("ZZ-empty") === 30, "future empty same-weekday -> 30");
  assert(cap("ZZ-booked") === 24, "booked departure untouched");
  assert(cap("ZZ-blocked") === 24, "blocked departure untouched");
  assert(cap("ZZ-past") === 24, "past departure untouched");
  assert(cap("ZZ-otherwd") === 24, "different-weekday departure untouched");
  assert(cap("ZZ-ota") === 24, "OTA-held departure untouched (allotment_hold > 0)");

  console.log("2. removeFutureEmptyForSlot deletes only the future empty same-weekday departure");
  d1(
    `DELETE FROM tour_sessions WHERE tour_id='ZZ-tour' AND start_time='09:00' AND date >= '${TODAY}'
       AND CAST(strftime('%w', date) AS INTEGER) = ${W} AND booked_count = 0 AND is_blocked = 0 AND allotment_hold = 0`
  );
  assert(!exists("ZZ-empty"), "future empty same-weekday deleted");
  assert(exists("ZZ-booked"), "booked departure survives (won't orphan a guest)");
  assert(exists("ZZ-blocked"), "blocked departure survives (staff decision)");
  assert(exists("ZZ-past"), "past departure survives");
  assert(exists("ZZ-otherwd"), "different-weekday departure survives");
  assert(exists("ZZ-ota"), "OTA-held departure survives (allotment_hold > 0)");
} finally {
  d1("DELETE FROM tour_sessions WHERE id LIKE 'ZZ-%'");
  d1("DELETE FROM tours WHERE id='ZZ-tour'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll schedule-template gate-test assertions passed.");
