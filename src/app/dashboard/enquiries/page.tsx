import { listEnquiries } from "@/lib/queries/enquiries";
import { formatDateTime } from "@/lib/format";
import { setEnquiryStatus } from "./actions";

const STATUS_BADGE: Record<string, string> = {
  new: "pr-dash-badge-warn",
  contacted: "pr-dash-badge-ok",
  closed: "pr-dash-badge-neutral",
};

/**
 * The staff inbox for contact-form submissions (CMS coverage audit: enquiries
 * were written to D1 and readable by no one -- silently lost leads; the
 * `status` column existed "for triage" with no UI). Read + one-click triage,
 * no editing -- staff reply by email/WhatsApp, this just tracks who's been
 * handled.
 */
export default async function EnquiriesPage() {
  const enquiries = await listEnquiries();
  const openCount = enquiries.filter((e) => e.status === "new").length;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Enquiries</h1>
        <p>{openCount === 0 ? "No new enquiries." : `${openCount} new enquir${openCount === 1 ? "y" : "ies"} to handle.`}</p>
      </div>

      {enquiries.length === 0 ? (
        <div className="pr-dash-card">
          <div className="pr-dash-empty">Nothing here yet -- contact-form messages land in this inbox.</div>
        </div>
      ) : (
        enquiries.map((e) => (
          <div key={e.id} className="pr-dash-card">
            <div className="pr-dash-actions" style={{ justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <strong>{e.name}</strong>
                <span style={{ color: "var(--ink-3)", marginLeft: "10px", fontSize: "13.5px" }}>
                  {formatDateTime(e.created_at)}
                </span>
              </div>
              <span className={"pr-dash-badge " + (STATUS_BADGE[e.status] ?? "pr-dash-badge-neutral")}>{e.status}</span>
            </div>
            <p style={{ color: "var(--ink-2)", fontSize: "14.5px", marginBottom: "10px", whiteSpace: "pre-wrap" }}>{e.message}</p>
            <div className="pr-dash-actions">
              <a className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" href={`mailto:${e.email}`}>
                {e.email}
              </a>
              {e.phone && (
                <a className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm" href={`tel:${e.phone}`}>
                  {e.phone}
                </a>
              )}
              {e.status !== "contacted" && (
                <form action={setEnquiryStatus.bind(null, e.id, "contacted")}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-sm">
                    Mark contacted
                  </button>
                </form>
              )}
              {e.status !== "closed" && (
                <form action={setEnquiryStatus.bind(null, e.id, "closed")}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                    Close
                  </button>
                </form>
              )}
              {e.status === "closed" && (
                <form action={setEnquiryStatus.bind(null, e.id, "new")}>
                  <button type="submit" className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm">
                    Reopen
                  </button>
                </form>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
