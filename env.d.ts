// Augments the generated CloudflareEnv (cloudflare-env.d.ts) with vars that
// intentionally do NOT live in wrangler.jsonc: DEV_AUTH_BYPASS must only ever
// exist in gitignored .dev.vars (see lib/access.ts), and CF_ACCESS_* are set
// as Worker secrets once the Access application exists (§1a), not committed
// config. `wrangler types` won't know about these from wrangler.jsonc alone.
declare global {
  interface CloudflareEnv {
    DEV_AUTH_BYPASS?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
  }
}

export {};
