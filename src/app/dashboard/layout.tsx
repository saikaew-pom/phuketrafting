import { notFound } from "next/navigation";
import { Sora, Plus_Jakarta_Sans } from "next/font/google";
import { requireStaff, type StaffIdentity } from "@/lib/access";
import { DashboardShell } from "./DashboardShell";

// Same font setup as src/app/[lang]/layout.tsx -- the variables MUST be
// declared on a wrapper that also carries .pr-app, because --font-head/
// --font-body are defined on .pr-app and resolve their var() references at
// their own declaration site (see the long comment in globals.css; getting
// this wrong silently renders the whole dashboard in Times). DashboardShell
// applies .pr-app; this layout supplies the font variables around it.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// requireStaff() calls next/headers' headers() indirectly (inside
// src/lib/access.ts), not directly in this component body. Next 16's
// Turbopack build didn't detect that transitively and tried to statically
// prerender /dashboard/products/camping at build time, where
// getCloudflareContext() isn't available (same class of failure as
// src/app/[lang]/page.tsx -- see its comment). Force dynamic explicitly
// rather than relying on Dynamic API auto-detection through a helper.
export const dynamic = "force-dynamic";

// Next.js 16's proxy.ts defaults to the Node.js runtime with no way to opt
// into Edge (see node_modules/next/dist/docs/.../proxy.md, "Runtime"
// section), and @opennextjs/cloudflare hard-fails the build on Node.js
// middleware -- so there is no proxy/middleware file gating /dashboard at
// the edge. This layout gates *rendering* the dashboard UI: it verifies the
// Cloudflare Access JWT itself (cheap -- JWKS is isolate-cached) and fails
// closed on any error (including a D1 lookup failure, since requireStaff()
// covers both) -- Access confirms *who*, the staff table is the only source
// of truth for *what they can do*.
//
// This does NOT protect the Server Actions rendered inside these pages --
// Next.js does not run a route's layout before invoking a bound Server
// Action, so saveTour/saveCampZone (and any future mutation) must call
// requireStaff() themselves too. See requireStaff()'s doc comment in
// src/lib/access.ts.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let staff: StaffIdentity;
  try {
    staff = await requireStaff();
  } catch {
    // Covers: missing/invalid Access JWT, an Access-authenticated email
    // that isn't (yet) in the staff table (Access and the role table can
    // drift), an inactive staff row, or the D1 lookup itself throwing --
    // all fail closed to the same 404 rather than leaking which case hit.
    notFound();
  }

  return (
    <div className={`${sora.variable} ${plusJakartaSans.variable}`}>
      <DashboardShell staff={staff}>{children}</DashboardShell>
    </div>
  );
}
