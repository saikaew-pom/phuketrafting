import Link from "next/link";

export default function DashboardHome() {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Products:</p>
      <ul>
        <li>
          <Link href="/dashboard/products/tours">Tours</Link>
        </li>
        <li>
          <Link href="/dashboard/products/camping">Camping</Link>
        </li>
        <li>
          <Link href="/dashboard/bookings">Bookings</Link>
        </li>
        <li>
          <Link href="/dashboard/day-sheet">Day sheet</Link>
        </li>
        <li>
          <Link href="/dashboard/blog">Blog</Link>
        </li>
      </ul>
      <p>Conversations/reviews/settings screens land in later phases.</p>
    </div>
  );
}
