import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./image-loader.ts",
  },

  // 301 map from the live WordPress/WooCommerce site (crawled via its
  // wp-sitemap-*.xml index -- see BUILD_AND_DEPLOY_PLAN.md Phase 3/9) to
  // preserve 20 years of link equity through the domain cutover. Resolved
  // at build time via Next's routing manifest, not edge middleware, so it
  // works on this stack the same way proxy.ts couldn't (see src/lib/access.ts
  // for why that file is gone).
  //
  // None of these have a dedicated destination page yet (Tour Packages /
  // Camping Stay detail pages are deferred, see BUILD_AND_DEPLOY_PLAN.md
  // Phase 3 scope), so every tour/camping URL lands on the Landing page's
  // #tours section for now -- revisit once those pages exist. WooCommerce
  // account/cart/checkout URLs have no equivalent yet (the booking engine
  // is Phase 4, not WooCommerce-based) and go to the homepage. The one blog
  // post that ever existed was WordPress's default "Hello World" placeholder
  // -- no real content to preserve there.
  async redirects() {
    return [
      // Replaces the old src/app/page.tsx (a bare `redirect()` component).
      // Moved here so app/ has no leaf route left outside [lang]/ and
      // dashboard/ -- see [lang]/layout.tsx's comment on why that matters:
      // each is now its own root layout with its own <html lang>, and a
      // React root layout must define <html>/<body>, so a page directly
      // under app/ with neither ancestor would have nothing to render into.
      // Resolved at build time via Next's routing manifest (same as every
      // entry below), so this needs no component, no layout, and no runtime
      // cost -- strictly simpler than the file it replaces.
      { source: "/", destination: "/en", permanent: true },
      { source: "/home", destination: "/en", permanent: true },
      { source: "/about", destination: "/en#why", permanent: true },
      { source: "/services", destination: "/en#tours", permanent: true },
      { source: "/contact", destination: "/en#contact", permanent: true },
      { source: "/shop", destination: "/en#tours", permanent: true },
      { source: "/tours", destination: "/en#tours", permanent: true },
      { source: "/product/:slug*", destination: "/en#tours", permanent: true },
      { source: "/product-category/:slug*", destination: "/en#tours", permanent: true },
      { source: "/cart", destination: "/en", permanent: true },
      { source: "/checkout", destination: "/en", permanent: true },
      { source: "/my-account", destination: "/en", permanent: true },
      { source: "/my-account-2", destination: "/en", permanent: true },
      { source: "/registration", destination: "/en", permanent: true },
      { source: "/login", destination: "/en", permanent: true },
      { source: "/lost-password", destination: "/en", permanent: true },
      { source: "/evercompare", destination: "/en", permanent: true },
      { source: "/hello-world", destination: "/en", permanent: true },
    ];
  },

  // The site had no security response headers at all. These four are the
  // safe, low-risk subset: none of them can break an existing feature, since
  // none constrain *what* the page is allowed to load (that's Content-
  // Security-Policy's job, deliberately NOT added here -- this app leans on
  // an inline theme <style>, GA4's inline consent-mode script + gtag.js from
  // googletagmanager.com, next/font's Google Fonts, Cloudinary images,
  // Turnstile's widget script and Stripe's redirect, and a CSP that doesn't
  // allowlist every one of those correctly fails closed by breaking the
  // feature, not by degrading -- that needs its own dedicated, page-by-page
  // verified pass, not a line added alongside a broad sweep of unrelated
  // fixes).
  //
  // Referrer-Policy here is the sitewide default; /[lang]/manage/[token]
  // already sets a stricter `<meta name="referrer" content="no-referrer">`
  // for itself, and a page-level meta tag overrides the HTTP header per spec,
  // so the two don't conflict.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops a browser from guessing a response's MIME type from its
          // content and executing it as something other than what the
          // Content-Type header says -- the classic vector is an uploaded
          // "image" that's actually script, sniffed as HTML/JS and run.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No page on this site is meant to be framed by another origin --
          // there's no embed/widget use case here, only ways framing could be
          // abused (clickjacking a booking button, a fake overlay on the
          // dashboard).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Send the full URL to same-origin requests (useful for our own
          // analytics/debugging) but only the origin, not the path, cross-
          // origin -- balances GA4/outbound-link utility against leaking
          // page content (booking details, a manage_token-bearing path
          // before the page-level override above applies) to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year, including subdomains, once a browser has
          // seen it once. Harmless to send unconditionally -- Cloudflare
          // Workers only ever serve this app over HTTPS in production, and a
          // browser only acts on HSTS from a secure context in the first
          // place, so this header is inert (never read) during local
          // `wrangler dev`/`preview` over plain HTTP.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
