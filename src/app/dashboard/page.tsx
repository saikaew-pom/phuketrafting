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
      </ul>
      <p>Availability, bookings, blog, conversations, reviews, and settings screens land in later phases.</p>
    </div>
  );
}
