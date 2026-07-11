import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDevBypassIdentity, verifyAccessHeaders } from "@/lib/access";
import { getDb } from "@/lib/db";

interface StaffRow {
  email: string;
  name: string;
  role: string;
  active: number;
}

// middleware.ts already blocked unauthenticated requests to /dashboard/*.
// This layout re-derives identity (cheap — JWKS is isolate-cached) rather
// than trusting a forwarded header, then looks up the role: Access confirms
// *who*, this table is the only source of truth for *what they can do*.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const bypass = getDevBypassIdentity(requestHeaders.get("host"));
  const identity = bypass ?? (await verifyAccessHeaders(requestHeaders));

  const staff = await getDb()
    .prepare("SELECT email, name, role, active FROM staff WHERE email = ?1")
    .bind(identity.email)
    .first<StaffRow>();

  if (!staff || !staff.active) {
    // A real, Access-authenticated email that isn't (yet) in the staff
    // table — Access and the role table can drift; fail closed.
    notFound();
  }

  return (
    <div style={{ padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid #ddd" }}>
        <strong>Phuket Rafting — Staff</strong>
        <span style={{ marginLeft: "16px", color: "#666" }}>
          {staff.name} ({staff.email}) · {staff.role}
        </span>
      </header>
      {children}
    </div>
  );
}
