import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeamDomain: string | null = null;

// Filled in once the Cloudflare Access application exists (Phase 1, §1a of
// BUILD_AND_DEPLOY_PLAN.md). Team domain looks like https://<team-name>.cloudflareaccess.com;
// AUD tag comes from Zero Trust dashboard → Access → Applications → this app → Overview.
// Read via getCloudflareContext().env, NOT process.env — Wrangler vars/secrets
// (.dev.vars locally, `wrangler secret` in production) surface through the
// Workers env binding, the same way D1/R2 bindings do; process.env does not
// reliably reflect them on this runtime.
function getJwks(teamDomain: string) {
  // Cached across requests within the same isolate — createRemoteJWKSet
  // handles its own key rotation via the JWKS endpoint's cache headers.
  // Re-create if the configured team domain ever changes (e.g. across tests).
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksTeamDomain = teamDomain;
  }
  return jwks;
}

export interface AccessIdentity {
  email: string;
}

/** Core verification, shared by the Request-based and Headers-based callers below. */
async function verifyAccessToken(token: string): Promise<AccessIdentity> {
  const { env } = getCloudflareContext();
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const policyAud = env.CF_ACCESS_AUD;
  if (!teamDomain) throw new Error("CF_ACCESS_TEAM_DOMAIN is not configured");
  if (!policyAud) throw new Error("CF_ACCESS_AUD is not configured");

  const { payload } = await jwtVerify(token, getJwks(teamDomain), {
    issuer: teamDomain,
    audience: policyAud,
  });

  if (typeof payload.email !== "string") {
    throw new Error("Access token payload missing email claim");
  }
  return { email: payload.email };
}

/**
 * Verifies the Cf-Access-Jwt-Assertion header Cloudflare Access attaches to
 * every request that passes its edge policy check. Prefer this header over
 * the CF_Authorization cookie — Cloudflare's own docs say the cookie "is not
 * guaranteed to be passed". For middleware.ts (has a Request).
 */
export async function verifyAccessRequest(request: Request): Promise<AccessIdentity> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    throw new Error("Missing Cf-Access-Jwt-Assertion header");
  }
  return verifyAccessToken(token);
}

/** Same as verifyAccessRequest, for Server Components using next/headers. */
export async function verifyAccessHeaders(requestHeaders: Headers): Promise<AccessIdentity> {
  const token = requestHeaders.get("cf-access-jwt-assertion");
  if (!token) {
    throw new Error("Missing Cf-Access-Jwt-Assertion header");
  }
  return verifyAccessToken(token);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Dev-only mock identity. Two independent conditions must both hold before
 * this ever returns anything:
 *
 * 1. The request's Host header must be localhost/127.0.0.1. NOT a NODE_ENV
 *    check — `opennextjs-cloudflare build` always runs `next build` under
 *    the hood, which inlines NODE_ENV="production" into the bundle even for
 *    local `npm run preview` (there's no separate "dev build" artifact for
 *    Workers), so NODE_ENV can't distinguish local preview from a real
 *    deploy. Host header can: a real deployed Worker's traffic never
 *    arrives with a localhost Host header.
 * 2. DEV_AUTH_BYPASS must be "true", which only ever exists in gitignored
 *    .dev.vars — never uploaded by `wrangler deploy`/OpenNext's deploy, and
 *    must never be added to wrangler.jsonc vars or a production secret.
 *
 * Cloudflare Access cannot reach localhost at all, so the
 * Cf-Access-Jwt-Assertion header is never present in local dev by
 * construction — this bypass is the only way to exercise /dashboard without
 * deploying.
 */
export function getDevBypassIdentity(hostHeader: string | null): AccessIdentity | null {
  const host = hostHeader?.split(":")[0] ?? "";
  if (!LOCAL_HOSTS.has(host)) return null;
  const { env } = getCloudflareContext();
  if (env.DEV_AUTH_BYPASS !== "true") return null;
  return { email: "dev-admin@localhost" };
}
