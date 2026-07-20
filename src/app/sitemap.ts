import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { listPublishedPosts } from "@/lib/queries/blog";

// sitemap.ts is a Route Handler that Next caches by default (see
// node_modules/next/dist/docs/.../metadata/sitemap.md). It now reads D1 for
// published posts, and getCloudflareContext() only exists at request time --
// so it must opt out of the build-time render, exactly like every [lang]/*
// page already does.
export const dynamic = "force-dynamic";

// Only /en is listed -- TH/ZH/RU routes render today (dynamicParams) but
// serve identical English copy until real per-locale translations exist
// (BUILD_AND_DEPLOY_PLAN.md Phase 3 note); listing near-duplicate-content
// URLs here would be actively bad for SEO, not just incomplete.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts(DEFAULT_LOCALE);

  return [
    {
      url: `${SITE_URL}/${DEFAULT_LOCALE}`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/${DEFAULT_LOCALE}/blog`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/${DEFAULT_LOCALE}/gallery`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    // Drafts are excluded by listPublishedPosts' own WHERE clause -- an
    // unpublished post must never be advertised to a crawler, which would
    // otherwise be the one way a draft leaks before staff are ready.
    ...posts.map((post) => ({
      url: `${SITE_URL}/${DEFAULT_LOCALE}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at * 1000),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
