"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireStaff } from "@/lib/access";
import { checkRateLimit } from "@/lib/rate-limit";
import { addImage, deleteImage, moveImage } from "@/lib/queries/images";
import { suggestGalleryCaption } from "@/lib/gallery-ai";
import { describeAiError } from "@/lib/ai";

// Revalidate both the dashboard screen and the public landing page (all
// locales) so an edit shows up on the site immediately. The gallery renders
// inside the [lang] route.
function revalidateGallery(): void {
  revalidatePath("/dashboard/gallery");
  revalidatePath("/[lang]", "page");
}

/**
 * Saves every photo the multi-upload widget collected in one submit. Each
 * file already reached Cloudinary directly from the browser (unsigned
 * upload, same as the single-photo flow this replaces); this just persists
 * the resulting {image_id, label} pairs. Sequential addImage() calls, not a
 * single batch: this screen is staff-only and low-frequency, and addImage's
 * own guarded append (sort_order = MAX+1 read fresh each call) already keeps
 * ordering correct across N sequential inserts -- no race to close here the
 * way the booking-capacity path has to.
 *
 * useActionState shape (prevCount, formData) => nextCount, same mechanism as
 * blog/actions.ts's createBlogPost/saveBlogPost -- NOT a plain <form
 * action={fn}> anymore. A plain form action gives the child
 * MultiImageUploadField no way to learn a save succeeded, so its `rows`
 * state kept showing the just-saved photos afterward; confirmed live that
 * clicking Save again (or just adding a follow-up batch later in the same
 * sitting) resubmitted them and duplicated every photo in the gallery. The
 * caller (GalleryUploadForm) remounts MultiImageUploadField on the returned
 * count via `key`, which is what actually clears `rows` -- this return value
 * only exists to change on every successful save so that remount fires.
 */
export async function saveGalleryImages(prevCount: number, formData: FormData): Promise<number> {
  await requireStaff();

  // MultiImageUploadField submits one JSON-encoded array under this field --
  // parsed defensively, same "client payload is a claim, not a fact" stance
  // as every other form input in this app. Malformed JSON or a wrong shape
  // degrades to "nothing saved," never a thrown 500.
  const raw = String(formData.get("images") ?? "");
  let items: { image_id: string; label?: string | null }[] = [];
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      items = parsed.filter((x): x is { image_id: string; label?: string | null } => {
        if (!x || typeof x !== "object") return false;
        const rec = x as Record<string, unknown>;
        // label is checked too, not just image_id -- the type predicate
        // claims `label` is a string (or absent), so it must actually be one:
        // a crafted payload like {image_id:"abc", label:42} used to pass this
        // filter and then blow up on item.label.trim() below (label is a
        // number, not a string), throwing out of the whole action -- and
        // taking down images earlier in the loop that had already been
        // committed to D1 one at a time, plus the revalidate call, with it.
        const labelOk = rec.label === undefined || rec.label === null || typeof rec.label === "string";
        return typeof rec.image_id === "string" && rec.image_id.trim() !== "" && labelOk;
      });
    }
  } catch {
    items = [];
  }

  for (const item of items) {
    await addImage("gallery", null, item.image_id.trim(), item.label?.trim() || null);
  }
  revalidateGallery();
  return prevCount + 1;
}

export async function removeGalleryImage(id: string): Promise<void> {
  await requireStaff();
  await deleteImage(id);
  revalidateGallery();
}

export async function moveGalleryImage(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveImage(id, direction);
  revalidateGallery();
}

export interface AiResult {
  text: string | null;
  error: string | null;
}

/**
 * Called directly from the multi-upload client component (not bound to a
 * <form action>) -- same RPC-style Server Action call as the blog editor's
 * generateDraftAction/generateExcerptAction.
 *
 * Same per-staff rate-limit key (`staff-ai:${email}`, 20/min) as the blog AI
 * buttons -- deliberately the SAME bucket, not a separate one: the intent is
 * "bound how often ONE staff member can trigger a paid model call" across
 * every staff-AI feature, not per-feature (Audit A25's original reasoning).
 */
export async function suggestCaptionAction(hint: string): Promise<AiResult> {
  const staff = await requireStaff();
  const allowed = await checkRateLimit(`staff-ai:${staff.email}`, 20, 60);
  if (!allowed) return { text: null, error: "Too many AI requests -- please wait a minute and try again." };
  if (!hint.trim()) return { text: null, error: "Type a short hint about the photo first." };

  const { env } = getCloudflareContext();
  try {
    const text = await suggestGalleryCaption(hint, env);
    if (!text) return { text: null, error: "AI isn't configured on this environment." };
    return { text, error: null };
  } catch (err) {
    // describeAiError, not raw err.message: an Anthropic APIError's message
    // IS the vendor's raw HTTP response body (status, error type, request_id)
    // -- confirmed live via a real MiniMax 429, which this used to show
    // staff verbatim. See lib/ai.ts's describeAiError for the full story.
    return { text: null, error: describeAiError(err) };
  }
}
