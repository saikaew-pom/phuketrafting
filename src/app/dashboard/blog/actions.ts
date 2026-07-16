"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireStaff } from "@/lib/access";
import { createPost, updatePost, deletePost, getPostBySlug, isBlogCategory, type BlogPostInput } from "@/lib/queries/blog";
import { generateBlogDraft, generateBlogExcerpt } from "@/lib/blog-ai";
import { DEFAULT_LOCALE } from "@/lib/i18n";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/**
 * A manually-typed slug is re-run through the same sanitizer as an
 * auto-generated one -- never trust it verbatim, same "client input is a
 * claim, not a fact" rule this codebase applies everywhere else (tour
 * session ids, promo codes, chatbot tool args).
 */
function readInput(formData: FormData): BlogPostInput {
  const category = String(formData.get("category") ?? "");
  if (!isBlogCategory(category)) {
    throw new Error("Please choose a valid category.");
  }
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    throw new Error("Title is required.");
  }
  const typedSlug = String(formData.get("slug") ?? "").trim();
  const slug = slugify(typedSlug || title);
  if (!slug) {
    throw new Error("Couldn't derive a URL slug from that title -- please set one manually.");
  }

  return {
    slug,
    locale: DEFAULT_LOCALE,
    title,
    excerpt: String(formData.get("excerpt") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
    category,
    cover_image_id: String(formData.get("cover_image_id") ?? "").trim(),
    author: String(formData.get("author") ?? "").trim(),
    featured: formData.get("featured") === "on",
    is_published: formData.get("is_published") === "on",
  };
}

/**
 * blog_posts.slug is UNIQUE (migration 0006) and this is the first blog
 * content anyone's edited concurrently on similar topics -- two posts titled
 * close enough to slugify the same is a real, expected collision (Phase 7d
 * plans 10 launch posts from the same 5-category taxonomy), not a coding
 * error. Reject it here with a message pointing at the fix, same
 * "clear message instead of an opaque DB error" precedent as
 * bookings/actions.ts's changeBookingStatus -- otherwise this throws
 * straight from the D1 UNIQUE constraint (confirmed live: an unhandled
 * "D1_ERROR: UNIQUE constraint failed: blog_posts.slug" with no
 * error.tsx anywhere in the app to catch it, i.e. it takes the whole page
 * down and any AI-generated draft/excerpt in the form with it, in dev and
 * -- since Server Action errors are digest-redacted and there's still no
 * boundary -- worse in production).
 *
 * `excludePostId` lets an edit save its own unchanged slug back.
 */
async function assertSlugAvailable(slug: string, excludePostId: string | null): Promise<void> {
  const existing = await getPostBySlug(slug);
  if (existing && existing.id !== excludePostId) {
    throw new Error(`The slug "${slug}" is already used by another post -- please choose a different one.`);
  }
}

export async function createBlogPost(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const input = readInput(formData);
  if (!input.author) input.author = staff.name;
  await assertSlugAvailable(input.slug, null);

  const id = await createPost(input);
  revalidatePath("/dashboard/blog");
  redirect(`/dashboard/blog/${id}`);
}

export async function saveBlogPost(postId: string, formData: FormData): Promise<void> {
  await requireStaff();
  const input = readInput(formData);
  await assertSlugAvailable(input.slug, postId);

  const ok = await updatePost(postId, input);
  if (!ok) {
    throw new Error("That post no longer exists.");
  }
  revalidatePath("/dashboard/blog");
  revalidatePath(`/dashboard/blog/${postId}`);
}

export async function deleteBlogPost(postId: string): Promise<void> {
  await requireStaff();
  const ok = await deletePost(postId);
  if (!ok) {
    throw new Error("That post no longer exists.");
  }
  revalidatePath("/dashboard/blog");
  redirect("/dashboard/blog");
}

export interface AiResult {
  text: string | null;
  error: string | null;
}

/**
 * Called directly from the editor client component (not bound to a
 * <form action>) -- Server Actions are plain async functions the client can
 * invoke like any RPC, and here the result fills a textarea in place rather
 * than submitting/reloading the page the way createBlogPost/saveBlogPost do.
 */
export async function generateDraftAction(title: string, category: string): Promise<AiResult> {
  await requireStaff();
  if (!title.trim()) return { text: null, error: "Enter a title first." };
  if (!isBlogCategory(category)) return { text: null, error: "Choose a category first." };

  const { env } = getCloudflareContext();
  try {
    const text = await generateBlogDraft(title, category, env);
    if (!text) return { text: null, error: "AI isn't configured on this environment." };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : "AI generation failed." };
  }
}

export async function generateExcerptAction(body: string): Promise<AiResult> {
  await requireStaff();
  if (!body.trim()) return { text: null, error: "Write (or generate) the article body first." };

  const { env } = getCloudflareContext();
  try {
    const text = await generateBlogExcerpt(body, env);
    if (!text) return { text: null, error: "AI isn't configured on this environment." };
    return { text, error: null };
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : "AI generation failed." };
  }
}
