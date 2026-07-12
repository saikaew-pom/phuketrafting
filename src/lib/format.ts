export function baht(amount: number): string {
  return "฿" + amount.toLocaleString("en-US");
}
