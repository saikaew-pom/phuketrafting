import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { LOCAL_HOSTS, hostnameFromHost } from "@/lib/access";

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
 * Returns null rather than guessing -- if Host is somehow absent, or present
 * but not one this app recognizes as local-dev or production -- so callers
 * can degrade explicitly instead of building a malformed URL that Stripe
 * rejects or, worse, that silently points somewhere wrong.
 */
export async function getRequestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;

  // Validated against an allowlist (known local-dev hosts, or the
  // configured production origin) before being trusted as a URL fragment
  // for a Stripe success_url or a manage-booking link Brevo actually mails
  // out. This is additive, not a behavior change for real traffic: every
  // legitimate request already arrives with a Host that matches one of
  // these two, since that's how Cloudflare's edge decides to route it to
  // this Worker at all -- so isKnownHost is true on every real request
  // today, and the code below it runs exactly as it always did. The
  // fallback only engages for a Host that matches neither, which the
  // Cloudflare-routing guarantee above suggests may not even be reachable
  // in production -- kept as defense-in-depth for a value that flows into
  // an outbound payment redirect and an emailed capability link, rather
  // than left unvalidated on the strength of "probably can't happen."
  // hostnameFromHost, not a raw split(":")[0] -- see its doc comment in
  // access.ts. Matters here specifically because LOCAL_HOSTS includes the
  // IPv6 loopback literal "[::1]", which a naive split mangles, silently
  // making that entry unmatchable and sending an IPv6-loopback local dev
  // request through the "unknown host" branch below instead.
  const hostname = hostnameFromHost(host);
  const { env } = getCloudflareContext();
  let productionHost: string | null = null;
  try {
    productionHost = env.PUBLIC_BASE_URL ? new URL(env.PUBLIC_BASE_URL).host : null;
  } catch {
    productionHost = null; // malformed PUBLIC_BASE_URL -- treat as unconfigured, not a crash
  }
  const isKnownHost = LOCAL_HOSTS.has(hostname) || host === productionHost;
  if (!isKnownHost) {
    // Not local, and doesn't match the configured production origin -- e.g. a
    // developer testing over a LAN IP (phone testing) or a tunnel domain
    // (ngrok/cloudflared). Degrades to null, the same as a missing Host
    // header, rather than substituting env.PUBLIC_BASE_URL: this Host is
    // unvalidated, and a Host we don't recognize is not evidence the request
    // is actually destined for production -- silently building a real Stripe
    // Checkout session or emailing a manage-link for PRODUCTION off the back
    // of a request that arrived somewhere else entirely (test D1, test
    // Stripe keys) is a worse outcome than the caller's existing "no origin"
    // degradation (checkout.ts skips Checkout and logs it; the email callers
    // already omit the manage link when this is null).
    return null;
  }

  // x-forwarded-proto is set by Cloudflare's edge in production. Locally
  // (`wrangler dev`) it's absent and the server is plain http, so fall back on
  // LOCAL_HOSTS (the same check isKnownHost above already made -- reused
  // rather than re-implemented as a separate regex, which had previously
  // drifted out of sync with LOCAL_HOSTS by not covering "[::1]" either)
  // rather than hardcoding https -- an https://localhost:8787 success_url
  // would fail to load for anyone testing checkout locally.
  const proto = h.get("x-forwarded-proto") ?? (LOCAL_HOSTS.has(hostname) ? "http" : "https");
  return `${proto}://${host}`;
}
