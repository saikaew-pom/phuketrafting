// Month-grid math for the Availability calendar. Pure/deterministic (UTC
// arithmetic only) so it behaves identically on the server and in tests --
// the same reason scheduling/format helpers pin everything to fixed offsets.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface MonthMeta {
  /** "YYYY-MM" */
  month: string;
  label: string;
  /** First day, "YYYY-MM-01". */
  firstISO: string;
  /** Last day, "YYYY-MM-DD". */
  lastISO: string;
  daysInMonth: number;
  /** Empty cells before day 1, Monday-first (0-6). */
  leadingBlanks: number;
  prevMonth: string;
  nextMonth: string;
}

/** True for a well-formed "YYYY-MM" with a real month (01-12). */
export function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM" of the month containing an ISO date. */
export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function monthMeta(month: string): MonthMeta {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)); // 1-12
  // Day 0 of the NEXT month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const dow = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const leadingBlanks = (dow + 6) % 7; // shift to Monday-first
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? year - 1 : year;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? year + 1 : year;
  return {
    month,
    label: `${MONTH_NAMES[m - 1]} ${year}`,
    firstISO: `${month}-01`,
    lastISO: `${month}-${pad2(daysInMonth)}`,
    daysInMonth,
    leadingBlanks,
    prevMonth: `${prevY}-${pad2(prevM)}`,
    nextMonth: `${nextY}-${pad2(nextM)}`,
  };
}

/** "YYYY-MM-DD" for a given day number within a month. */
export function dayISO(month: string, day: number): string {
  return `${month}-${pad2(day)}`;
}

/** "Sat 20 Jul 2026" style label for an ISO date. */
export function longDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${wd} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}
