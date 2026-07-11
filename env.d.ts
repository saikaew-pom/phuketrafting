// Augments the generated CloudflareEnv (cloudflare-env.d.ts) with vars that
// intentionally do NOT live in wrangler.jsonc: DEV_AUTH_BYPASS must only ever
// exist in gitignored .dev.vars (see lib/access.ts), and everything else here
// is a server-only secret set via `wrangler secret put` once each phase needs
// it, not committed config. `wrangler types` won't know about these from
// wrangler.jsonc alone. See .dev.vars.example for what each one is for.
declare global {
  interface CloudflareEnv {
    DEV_AUTH_BYPASS?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    MINIMAX_API_KEY?: string;
    MINIMAX_BASE_URL?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_WHATSAPP_NUMBER?: string;
    BREVO_API_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    SENTRY_DSN?: string;
  }
}

export {};
