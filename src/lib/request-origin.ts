import { headers } from "next/headers";

/**
 * The absolute origin this request actually arrived on, e.g.
 * "https://phuket-rafting.pskspace.workers.dev" or "http://localhost:8787".
 *
 * Deliberately NOT lib/site.ts's SITE_URL: that constant is the eventual
 * custom domain (phuketrafting.com), which isn't pointed at this Worker until
 * the Phase 9 DNS cutover -- a Stripe success_url or an emailed link built
 * from it would send a real guest to a domain that doesn't resolve. And not
 * env.PUBLIC_BASE_URL either: that's the deployed origin, which is right for
 * the crons (no request to read) but wrong here, since it would bounce a
 * guest testing on localhost out to production mid-checkout.
 *
 * Only for code running inside a request. The crons have no request and must
 * use env.PUBLIC_BASE_URL instead (see lib/cron/scheduled-notifications.ts).
 *
 * Returns null rather than guessing if Host is somehow absent, so callers can
 * degrade explicitly instead of building a malformed URL that Stripe rejects
 * or, worse, that silently points somewhere wrong.
 */
export async function getRequestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;

  // x-forwarded-proto is set by Cloudflare's edge in production. Locally
  // (`wrangler dev`) it's absent and the server is plain http, so fall back on
  // the host itself rather than hardcoding https -- an https://localhost:8787
  // success_url would fail to load for anyone testing checkout locally.
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
