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
};

initOpenNextCloudflareForDev();

export default nextConfig;
