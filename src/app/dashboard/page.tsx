import Link from "next/link";
import { CalendarCheck, ClipboardList, CalendarRange, Waves, Tent, Newspaper, Star, MapPin, Inbox, Settings } from "lucide-react";

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
    href: "/dashboard/availability",
    icon: CalendarRange,
    title: "Availability",
    blurb: "Open, close and resize departures.",
  },
  {
    href: "/dashboard/enquiries",
    icon: Inbox,
    title: "Enquiries",
    blurb: "Contact-form messages to follow up.",
  },
  {
    href: "/dashboard/products/tours",
    icon: Waves,
    title: "Tours",
    blurb: "Packages, prices, bullets and photos.",
  },
  {
    href: "/dashboard/products/camping",
    icon: Tent,
    title: "Camping",
    blurb: "Zones, nightly rates and photos.",
  },
  {
    href: "/dashboard/pickup",
    icon: MapPin,
    title: "Pickup zones",
    blurb: "Transfer areas and their fees.",
  },
  {
    href: "/dashboard/reviews",
    icon: Star,
    title: "Reviews",
    blurb: "Curate what guests say about you.",
  },
  {
    href: "/dashboard/blog",
    icon: Newspaper,
    title: "Blog",
    blurb: "Write, review and publish articles.",
  },
  {
    href: "/dashboard/settings",
    icon: Settings,
    title: "Settings",
    blurb: "Payments, cancellation window, chatbot.",
  },
];

export default function DashboardHome() {
  return (
    <div>
      <div className="pr-dash-head">
        <h1>Overview</h1>
        <p>Conversations (web chat + WhatsApp inbox) lands with Phase 8.</p>
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
