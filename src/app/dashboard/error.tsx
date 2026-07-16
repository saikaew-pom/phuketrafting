"use client";

/**
 * Recovery path for any thrown error inside /dashboard.
 *
 * Without this file, a Server Action that throws (every dashboard action
 * validates by throwing -- "Name is required", "That post no longer exists")
 * replaced the entire page with Next's bare "A server error occurred" screen
 * and an opaque digest, with no way back. Confirmed live on the availability
 * calendar: setting a capacity below what's booked -- an ordinary staff
 * mistake, not an edge case -- dead-ended the page.
 *
 * Deliberately does NOT try to show error.message: Next redacts it in
 * production and substitutes a digest, precisely so server details can't leak
 * to a browser (node_modules/next/dist/docs/.../error.md, "Good to know").
 * So this cannot be the place validation is explained -- forms have to
 * prevent bad input client-side (see the capacity input's `min`) and the
 * server throw stays as the real boundary. This screen's job is only to stop
 * a wrong keystroke from costing staff the page they were working on.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pr-dash-card" style={{ maxWidth: "560px" }}>
      <h2>That didn&apos;t work</h2>
      <p style={{ color: "var(--ink-2)", fontSize: "14.5px", margin: "8px 0 16px" }}>
        The change wasn&apos;t saved. Check the values and try again -- if it keeps happening, send a developer the
        reference below.
      </p>
      <div className="pr-dash-actions">
        <button type="button" className="pr-dash-btn" onClick={reset}>
          Try again
        </button>
      </div>
      {error.digest && (
        // The digest is the ONLY thing that ties this screen to the real
        // stack trace in `wrangler tail` -- without it a bug report is just
        // "it broke".
        <p className="pr-dash-field-hint" style={{ marginTop: "12px" }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
