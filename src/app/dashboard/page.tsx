import Link from "next/link";
import { CalendarCheck, ClipboardList, Waves, Tent, Newspaper } from "lucide-react";

const SECTIONS = [
  {
    href: "/dashboard/bookings",
    icon: CalendarCheck,
    title: "Bookings",
    blurb: "Confirm, edit and track every reservation.",
  },
  {
    href: "/dashboard/day-sheet",
    icon: ClipboardList,
    title: "Day sheet",
    blurb: "Today's manifest, check-ins and pickups.",
  },
  {
    href: "/dashboard/products/tours",
    icon: Waves,
    title: "Tours",
    blurb: "Packages, prices and photos.",
  },
  {
    href: "/dashboard/products/camping",
    icon: Tent,
    title: "Camping",
    blurb: "Zones, nightly rates and photos.",
  },
  {
    href: "/dashboard/blog",
    icon: Newspaper,
    title: "Blog",
    blurb: "Write, review and publish articles.",
  },
];

export default function DashboardHome() {
  return (
    <div>
      <div className="pr-dash-head">
        <h1>Overview</h1>
        <p>Conversations, reviews and settings screens land in later phases.</p>
      </div>
      <div className="pr-dash-grid">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className="pr-dash-card pr-dash-homecard">
              <Icon size={22} className="pr-ico pr-dash-homecard-ico" />
              <strong>{s.title}</strong>
              <span>{s.blurb}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
