import { getCloudflareContext } from "@opennextjs/cloudflare";

/** D1 binding for the current request. Never cache across requests. */
export function getDb() {
  return getCloudflareContext().env.DB;
}
