// Gate test for the consequence-aware close (Availability stage B). Stripe
// itself is external, so this proves the D1 invariants the close flow depends
// on, against the REAL local DB:
//   - listActiveBookingsForSession returns only pending/confirmed (a cancelled
//     booking on the same departure is ignored)
//   - the refund filter picks exactly the paid + has-Stripe-session bookings
//   - cancelBookingReleasingSeat releases the seat AND flips status=cancelled,
//     and can't drive booked_count negative
//   - after cancelling every active booking + blocking, the departure is
//     is_blocked=1 with booked_count back to 0, and the pre-cancelled booking
//     is untouched
//
// Run:  node scripts/verify-close-session.mjs
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

const ACTIVE = "status IN ('pending','confirmed','completed','no_show')";

// Mirrors cancelBookingReleasingSeat's two guarded statements exactly.
function cancelReleasing(bookingId) {
  d1(
    `UPDATE tour_sessions
        SET booked_count = booked_count - (SELECT b.adults + b.children FROM bookings b WHERE b.id='${bookingId}')
      WHERE id = (SELECT b.tour_session_id FROM bookings b WHERE b.id='${bookingId}')
        AND EXISTS (SELECT 1 FROM bookings b WHERE b.id='${bookingId}' AND b.tour_session_id IS NOT NULL AND ${ACTIVE})
        AND booked_count - (SELECT b.adults + b.children FROM bookings b WHERE b.id='${bookingId}') >= 0`
  );
  d1(`UPDATE bookings SET status='cancelled' WHERE id='${bookingId}' AND ${ACTIVE}`);
}

try {
  console.log("Seed: 1 departure (cap 24, booked 3) + 3 bookings (paid, awaiting, already-cancelled)");
  d1("INSERT INTO tours (id, slug, name, is_active) VALUES ('ZZ-tour','zz-tour','ZZ Tour',1)");
  d1(
    `INSERT INTO tour_sessions (id, tour_id, date, start_time, capacity, booked_count, allotment_hold, is_blocked)
     VALUES ('ZZ-sess','ZZ-tour','2026-09-20','09:00',24,3,0,0)`
  );
  // paid + confirmed (2 pax), awaiting + pending (1 pax), cancelled (3 pax, already released so not in booked_count)
  d1(
    `INSERT INTO bookings (id,type,tour_session_id,adults,children,infants,guest_name,source,status,payment_status,stripe_checkout_session_id,deposit_amount,total,currency)
     VALUES
     ('ZZ-bk-paid','tour','ZZ-sess',2,0,0,'Paid Guest','staff','confirmed','paid','cs_test_1',750,3000,'THB'),
     ('ZZ-bk-await','tour','ZZ-sess',1,0,0,'Awaiting Guest','staff','pending','awaiting_payment',NULL,375,1500,'THB'),
     ('ZZ-bk-cxl','tour','ZZ-sess',3,0,0,'Already Cancelled','staff','cancelled','paid','cs_test_2',1125,4500,'THB')`
  );

  console.log("1. listActiveBookingsForSession returns only active (not the cancelled one)");
  const active = d1(
    `SELECT b.id, b.payment_status, b.stripe_checkout_session_id
       FROM bookings b JOIN tour_sessions ts ON b.tour_session_id = ts.id
      WHERE b.tour_session_id='ZZ-sess' AND b.status IN ('pending','confirmed') ORDER BY b.id`
  );
  assert(active.length === 2, "2 active bookings returned (cancelled one excluded)");
  assert(!active.some((b) => b.id === "ZZ-bk-cxl"), "the already-cancelled booking is not in the list");

  console.log("2. Refund filter = paid AND has Stripe session");
  const refundable = active.filter((b) => b.payment_status === "paid" && b.stripe_checkout_session_id);
  assert(refundable.length === 1 && refundable[0].id === "ZZ-bk-paid", "only the paid+Stripe booking is refundable");

  console.log("3. Cancel-releasing each active booking releases the seat + cancels");
  cancelReleasing("ZZ-bk-paid");
  cancelReleasing("ZZ-bk-await");
  const sess = d1("SELECT booked_count, is_blocked FROM tour_sessions WHERE id='ZZ-sess'");
  assert(sess[0].booked_count === 0, `booked_count released to 0 (was 3), got ${sess[0].booked_count}`);
  const statuses = d1("SELECT id, status FROM bookings WHERE id IN ('ZZ-bk-paid','ZZ-bk-await')");
  assert(statuses.every((b) => b.status === "cancelled"), "both active bookings are now cancelled");

  console.log("4. Block the departure");
  d1("UPDATE tour_sessions SET is_blocked=1, block_reason='river too high' WHERE id='ZZ-sess'");
  const blocked = d1("SELECT is_blocked, block_reason FROM tour_sessions WHERE id='ZZ-sess'");
  assert(blocked[0].is_blocked === 1 && blocked[0].block_reason === "river too high", "departure is blocked with the reason");

  console.log("5. The pre-cancelled booking was never touched");
  const cxl = d1("SELECT status FROM bookings WHERE id='ZZ-bk-cxl'");
  assert(cxl[0].status === "cancelled", "already-cancelled booking still cancelled (not double-processed)");

  console.log("6. booked_count can't go negative (guard holds if run twice)");
  cancelReleasing("ZZ-bk-paid"); // already cancelled -> guard makes it a no-op
  const sess2 = d1("SELECT booked_count FROM tour_sessions WHERE id='ZZ-sess'");
  assert(sess2[0].booked_count === 0, "re-running cancel on an already-cancelled booking leaves booked_count at 0");
} finally {
  d1("DELETE FROM bookings WHERE id LIKE 'ZZ-bk-%'");
  d1("DELETE FROM tour_sessions WHERE id='ZZ-sess'");
  d1("DELETE FROM tours WHERE id='ZZ-tour'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll close-session gate-test assertions passed.");
