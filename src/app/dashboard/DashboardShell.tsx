"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  ClipboardList,
  Waves,
  Tent,
  Newspaper,
  Star,
  MapPin,
  Inbox,
  Settings,
  Menu,
  X,
} from "lucide-react";

/**
 * The dashboard chrome: sidebar on desktop, topbar + slide-down menu on
 * mobile. Client component only because active-link highlighting needs
 * usePathname and the mobile menu needs state -- auth stays in layout.tsx
 * (server), which passes the verified staff identity down as props.
 *
 * Staff run check-ins from phones at the river (same reason the day-sheet is
 * print-friendly), so the mobile layout is a first-class case, not a
 * breakpoint afterthought.
 */

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/dashboard/day-sheet", label: "Day sheet", icon: ClipboardList },
  { href: "/dashboard/products/tours", label: "Tours", icon: Waves },
  { href: "/dashboard/products/camping", label: "Camping", icon: Tent },
  { href: "/dashboard/enquiries", label: "Enquiries", icon: Inbox },
  { href: "/dashboard/pickup", label: "Pickup zones", icon: MapPin },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/blog", label: "Blog", icon: Newspaper },
  // Rendering is gated on role below, but that's UX, not security -- the
  // settings page and its action both requireAdmin() server-side.
  { href: "/dashboard/settings", label: "Settings", icon: Settings, adminOnly: true },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  // "Overview" must not light up for every /dashboard/* route -- exact only.
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function DashboardShell({
  staff,
  children,
}: {
  staff: { name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = NAV.filter((item) => !item.adminOnly || staff.role === "admin").map((item) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={"pr-dash-navlink" + (isActive(pathname, item) ? " pr-dash-navlink-active" : "")}
        onClick={() => setOpen(false)}
      >
        <Icon size={17} className="pr-ico" />
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <div className="pr-app pr-dash">
      <aside className="pr-dash-side">
        <div className="pr-dash-brand">
          <span className="pr-brand-name">
            PHUKET <span>RAFTING</span>
          </span>
          <span className="pr-dash-brand-sub">Staff</span>
        </div>
        <nav className="pr-dash-nav">{links}</nav>
        <div className="pr-dash-user">
          <strong>{staff.name}</strong>
          <span>{staff.email}</span>
          <span className="pr-dash-badge pr-dash-badge-neutral">{staff.role}</span>
        </div>
      </aside>

      <div className="pr-dash-topbar">
        <span className="pr-brand-name">
          PHUKET <span>RAFTING</span>
        </span>
        <button className="pr-dash-burger" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X size={22} className="pr-ico" /> : <Menu size={22} className="pr-ico" />}
        </button>
      </div>
      {open && (
        <div className="pr-dash-mobile">
          {links}
          <div className="pr-dash-user">
            <strong>{staff.name}</strong>
            <span>{staff.email}</span>
          </div>
        </div>
      )}

      <main className="pr-dash-main">{children}</main>
    </div>
  );
}
