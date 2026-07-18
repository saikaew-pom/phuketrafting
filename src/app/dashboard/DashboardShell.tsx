"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  ClipboardList,
  CalendarRange,
  Waves,
  Tent,
  TentTree,
  Newspaper,
  Star,
  Images,
  HelpCircle,
  MapPin,
  Package,
  Ticket,
  Inbox,
  CalendarCog,
  LayoutTemplate,
  Palette,
  Settings,
  LogOut,
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
  // `exact` because /dashboard/availability/camping is its own entry below --
  // without it the startsWith match in isActive() would light BOTH rows up
  // whenever the camp calendar is open.
  { href: "/dashboard/availability", label: "Availability", icon: CalendarRange, exact: true },
  { href: "/dashboard/availability/camping", label: "Camp calendar", icon: TentTree },
  { href: "/dashboard/schedule", label: "Weekly schedule", icon: CalendarCog, adminOnly: true },
  { href: "/dashboard/products/tours", label: "Tours", icon: Waves },
  { href: "/dashboard/products/camping", label: "Camping", icon: Tent },
  { href: "/dashboard/addons", label: "Add-ons", icon: Package },
  { href: "/dashboard/enquiries", label: "Enquiries", icon: Inbox },
  { href: "/dashboard/pickup", label: "Pickup zones", icon: MapPin },
  { href: "/dashboard/promos", label: "Promo codes", icon: Ticket },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/gallery", label: "Gallery", icon: Images },
  { href: "/dashboard/faqs", label: "FAQ", icon: HelpCircle },
  { href: "/dashboard/blog", label: "Blog", icon: Newspaper },
  // Rendering is gated on role below, but that's UX, not security -- the
  // settings page and its action both requireAdmin() server-side.
  { href: "/dashboard/homepage", label: "Homepage", icon: LayoutTemplate, adminOnly: true },
  { href: "/dashboard/appearance", label: "Appearance", icon: Palette, adminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, adminOnly: true },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  // "Overview" must not light up for every /dashboard/* route -- exact only.
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * Signs the staff member out of Cloudflare Access.
 *
 * A plain link to Cloudflare's own endpoint, NOT an app route: Access owns
 * the session (there is no app-side cookie or token to clear -- see
 * lib/access.ts, the app only ever *verifies* the JWT Cloudflare attaches).
 * Anything we implemented ourselves would look like it logged you out while
 * leaving the real Access session intact, so the next visit would silently
 * walk straight back in -- worse than no button at all, especially on the
 * shared laptop at the riverside office this exists for.
 *
 * /cdn-cgi/access/logout is served by Cloudflare's edge on this hostname, so
 * it works on any domain the Access app covers, with no config.
 */
function SignOut() {
  // The <a> is deliberate and the lint rule is wrong here: /cdn-cgi/* is
  // served by Cloudflare's edge and never reaches the Worker's router, so
  // next/link would client-side navigate to a route that doesn't exist and
  // the Access session would survive -- a sign-out button that doesn't sign
  // you out. A full browser navigation IS the mechanism.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/cdn-cgi/access/logout" className="pr-dash-signout">
        <LogOut size={15} className="pr-ico" /> Sign out
      </a>
    </>
  );
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
          <SignOut />
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
            <SignOut />
          </div>
        </div>
      )}

      <main className="pr-dash-main">{children}</main>
    </div>
  );
}
