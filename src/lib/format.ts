export function baht(amount: number): string {
  return "฿" + amount.toLocaleString("en-US");
}

/** D1 stores timestamps as unixepoch() seconds -- Date expects milliseconds. */
export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
