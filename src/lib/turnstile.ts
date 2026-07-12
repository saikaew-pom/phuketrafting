import { getCloudflareContext } from "@opennextjs/cloudflare";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifies a Turnstile widget response token server-side. Never trust the client's say-so alone. */
export async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  if (!token) return false;

  const { env } = getCloudflareContext();
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not configured");
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
  if (!response.ok) return false;

  const result = await response.json<{ success: boolean }>();
  return result.success === true;
}
