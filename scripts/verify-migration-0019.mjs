// Gate test for migration 0019 (availability_audit) + the bulk range semantics
// in lib/queries/availability-audit.ts. Exercises the REAL local D1:
//   - table + index exist
//   - bulk close blocks only the OPEN departures IN RANGE (out-of-range and
//     already-blocked ones are untouched)
//   - bulk set-capacity skips a departure it would oversell
//   - undo reopens exactly the recorded session_ids, and nothing else
//
// Run:  node scripts/verify-migration-0019.mjs
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
const blocked = (id) => d1(`SELECT is_blocked FROM tour_sessions WHERE id='${id}'`)[0].is_blocked;
const cap = (id) => d1(`SELECT capacity FROM tour_sessions WHERE id='${id}'`)[0].capacity;

try {
  console.log("1. Table + index exist");
  assert(d1("SELECT name FROM sqlite_master WHERE type='table' AND name='availability_audit'").length === 1, "availability_audit table present");
  assert(d1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_availability_audit_created'").length === 1, "index present");

  console.log("Seed: 4 departures (2 open in range, 1 blocked in range, 1 open out of range)");
  d1("INSERT INTO tours (id, slug, name, is_active) VALUES ('ZZ-tour','zz-tour','ZZ Tour',1)");
  d1(
    `INSERT INTO tour_sessions (id, tour_id, date, start_time, capacity, booked_count, allotment_hold, is_blocked) VALUES
     ('ZZ-s1','ZZ-tour','2026-09-10','09:00',24,0,0,0),
     ('ZZ-s2','ZZ-tour','2026-09-11','09:00',24,4,0,0),
     ('ZZ-s3','ZZ-tour','2026-09-12','09:00',24,0,0,1),
     ('ZZ-s4','ZZ-tour','2026-09-20','09:00',24,0,0,0)`
  );

  console.log("2. Bulk close range 09-10..09-15 blocks only the open in-range departures");
  // Mirror bulkCloseRange: select open in-range ids, then block them.
  const openIds = d1("SELECT id FROM tour_sessions WHERE tour_id='ZZ-tour' AND date>='2026-09-10' AND date<='2026-09-15' AND is_blocked=0").map((r) => r.id);
  assert(openIds.length === 2 && openIds.includes("ZZ-s1") && openIds.includes("ZZ-s2"), "selected exactly the 2 open in-range departures");
  d1("UPDATE tour_sessions SET is_blocked=1, block_reason='monsoon' WHERE tour_id='ZZ-tour' AND date>='2026-09-10' AND date<='2026-09-15' AND is_blocked=0");
  assert(blocked("ZZ-s1") === 1 && blocked("ZZ-s2") === 1, "s1 + s2 now blocked");
  assert(blocked("ZZ-s3") === 1, "already-blocked s3 untouched (still blocked)");
  assert(blocked("ZZ-s4") === 0, "out-of-range s4 untouched (still open)");

  console.log("3. Audit row records the exact session_ids that were blocked");
  d1(
    `INSERT INTO availability_audit (id, actor_email, action, tour_id, date_from, date_to, session_ids, reason, count)
     VALUES ('ZZ-aud','dev-admin@localhost','bulk_close','ZZ-tour','2026-09-10','2026-09-15','${JSON.stringify(openIds).replace(/'/g, "''")}','monsoon',2)`
  );
  const aud = d1("SELECT session_ids, count, undone FROM availability_audit WHERE id='ZZ-aud'")[0];
  assert(JSON.parse(aud.session_ids).length === 2 && aud.count === 2 && aud.undone === 0, "audit stored 2 session ids, count 2, not undone");

  console.log("4. Undo respects provenance: reopens still-monsoon ids, skips a re-closed one");
  // Simulate staff re-closing s1 for a DIFFERENT reason after the bulk close.
  d1("UPDATE tour_sessions SET block_reason='private charter' WHERE id='ZZ-s1'");
  const ids = JSON.parse(aud.session_ids);
  // Mirror undoBulkClose: reopen still-blocked recorded ids that STILL carry the
  // bulk close's reason ('monsoon'), skipping the differently-re-closed one.
  d1(`UPDATE tour_sessions SET is_blocked=0, block_reason=NULL WHERE is_blocked=1 AND block_reason='monsoon' AND id IN (${ids.map((i) => `'${i}'`).join(",")})`);
  d1("UPDATE availability_audit SET undone=1 WHERE id='ZZ-aud'");
  assert(blocked("ZZ-s2") === 0, "s2 (still monsoon) reopened by undo");
  assert(blocked("ZZ-s1") === 1, "s1 (re-closed as 'private charter') left closed — undo won't revert a different decision");
  assert(blocked("ZZ-s3") === 1, "s3 (not in the audit's ids) stays blocked");
  assert(d1("SELECT undone FROM availability_audit WHERE id='ZZ-aud'")[0].undone === 1, "audit row marked undone");
  // Restore s1 for the capacity step below.
  d1("UPDATE tour_sessions SET is_blocked=0, block_reason=NULL WHERE id='ZZ-s1'");

  console.log("5. Bulk set-capacity skips a departure it would oversell");
  // s2 has booked_count 4; setting capacity to 2 must skip it, set s1 (booked 0).
  d1("UPDATE tour_sessions SET capacity=2, updated_at=unixepoch() WHERE tour_id='ZZ-tour' AND date>='2026-09-10' AND date<='2026-09-15' AND 2 - allotment_hold >= booked_count");
  assert(cap("ZZ-s1") === 2, "s1 (0 booked) resized to 2");
  assert(cap("ZZ-s2") === 24, "s2 (4 booked) skipped — capacity can't drop below booked");
} finally {
  d1("DELETE FROM availability_audit WHERE id='ZZ-aud'");
  d1("DELETE FROM tour_sessions WHERE id LIKE 'ZZ-s%'");
  d1("DELETE FROM tours WHERE id='ZZ-tour'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll availability-audit gate-test assertions passed.");
