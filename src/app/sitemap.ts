import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only /en is listed -- TH/ZH/RU routes render today (dynamicParams) but
// serve identical English copy until real per-locale translations exist
// (BUILD_AND_DEPLOY_PLAN.md Phase 3 note); listing near-duplicate-content
// URLs here would be actively bad for SEO, not just incomplete.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/en`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
