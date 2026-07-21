export function baht(amount: number): string {
  return "฿" + amount.toLocaleString("en-US");
}

/**
 * Today's date (YYYY-MM-DD) in Asia/Bangkok, where the trips run. Thailand is
 * UTC+7 year-round (no DST), so a fixed +7h shift off the same absolute instant
 * is exact -- the same trick session-generator and the chat grounding use.
 *
 * The bug this exists to stop: `new Date().toISOString()` is the UTC date, so
 * between 00:00 and 07:00 Thailand time it returns YESTERDAY -- which showed
 * the day sheet crew yesterday's manifest during exactly the pre-dawn hours
 * they prep the morning pickups, and let the booking widgets offer a departure
 * dated local-yesterday. Safe to call in a client component: server and client
 * shift the same instant by the same fixed offset, so they agree (no
 * browser-locale dependence, no hydration mismatch outside the one-instant
 * midnight straddle any "today" has).
 */
export function bangkokTodayISO(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Same +7h shift as bangkokTodayISO, the "HH:MM" half instead of the date --
 *  for comparing against tour_sessions.start_time's own "HH:MM" format. */
export function bangkokNowTimeHHMM(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/**
 * D1 stores timestamps as unixepoch() seconds -- Date expects milliseconds.
 *
 * timeZone is explicit for the same reason bangkokTodayISO() above exists: with
 * no timeZone, toLocaleString uses the HOST zone, and Cloudflare Workers run in
 * UTC. A blog post published 02:30 Bangkok rendered its public date as the
 * previous day ("Jul 20, 7:30 PM" for what was Jul 21, 2:30 AM locally), and
 * every /dashboard timestamp was 7 hours behind the business day staff work in.
 */
export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}
