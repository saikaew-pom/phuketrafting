"use client";

import { useActionState, useState, useTransition } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { BLOG_CATEGORIES, type BlogPost } from "@/lib/queries/blog";
import { generateDraftAction, generateExcerptAction, type BlogFormState } from "./actions";

interface Props {
  post: BlogPost | null; // null = new post
  action: (prev: BlogFormState, formData: FormData) => Promise<BlogFormState>;
  onDelete?: () => Promise<void>;
}

const INITIAL_FORM_STATE: BlogFormState = { error: null };

export function BlogEditorClient({ post, action, onDelete }: Props) {
  const [formState, formAction, saving] = useActionState(action, INITIAL_FORM_STATE);
  const [title, setTitle] = useState(post?.title ?? "");
  const [category, setCategory] = useState(post?.category ?? BLOG_CATEGORIES[0].id);
  const [content, setContent] = useState(post?.content ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [excerptBusy, setExcerptBusy] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  async function handleGenerateDraft() {
    setAiError(null);
    setDraftBusy(true);
    const result = await generateDraftAction(title, category);
    setDraftBusy(false);
    if (result.error) {
      setAiError(result.error);
      return;
    }
    if (result.text) setContent(result.text);
  }

  async function handleGenerateExcerpt() {
    setAiError(null);
    setExcerptBusy(true);
    const result = await generateExcerptAction(content);
    setExcerptBusy(false);
    if (result.error) {
      setAiError(result.error);
      return;
    }
    if (result.text) setExcerpt(result.text);
  }

  function handleDeleteClick() {
    if (!onDelete) return;
    if (!confirm(`Delete "${post?.title ?? "this post"}"? This cannot be undone.`)) return;
    startDeleteTransition(() => {
      onDelete();
    });
  }

  return (
    <>
      <form action={formAction} className="pr-dash-form">
        <div className="pr-dash-card">
          <h2>Post</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-field">
              Title
              <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="pr-dash-field">
              Slug
              <input name="slug" defaultValue={post?.slug ?? ""} />
              <span className="pr-dash-field-hint">The address of the post, e.g. /en/blog/your-slug. Leave blank to generate from the title.</span>
            </label>
            <label className="pr-dash-field">
              Category
              <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pr-dash-field">
              Author
              <input name="author" defaultValue={post?.author ?? ""} placeholder="Defaults to your staff name" />
            </label>
            <ImageUploadField name="cover_image_id" initialPublicId={post?.cover_image_id ?? null} label="Cover image" />
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Article</h2>
          <div className="pr-dash-form">
            <div className="pr-dash-actions">
              <button type="button" className="pr-dash-btn pr-dash-btn-ghost" onClick={handleGenerateDraft} disabled={draftBusy || excerptBusy}>
                {draftBusy ? "Writing..." : "Write draft with AI"}
              </button>
              <span className="pr-dash-field-hint">Fills the body below -- always review before publishing.</span>
            </div>
            <label className="pr-dash-field">
              Body (markdown -- ## headings, **bold**, - bullets, [text](url) links)
              <textarea
                name="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={20}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: "13.5px" }}
              />
            </label>
            <div className="pr-dash-actions">
              <button type="button" className="pr-dash-btn pr-dash-btn-ghost" onClick={handleGenerateExcerpt} disabled={draftBusy || excerptBusy}>
                {excerptBusy ? "Writing..." : "Generate excerpt with AI"}
              </button>
            </div>
            <label className="pr-dash-field">
              Excerpt (shown on the blog list page)
              <textarea name="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
            </label>
            {aiError && <p className="pr-dash-error">{aiError}</p>}
          </div>
        </div>

        <div className="pr-dash-card">
          <h2>Publishing</h2>
          <div className="pr-dash-form">
            <label className="pr-dash-check">
              <input type="checkbox" name="featured" defaultChecked={post?.featured === 1} /> Featured
            </label>
            <label className="pr-dash-check">
              <input type="checkbox" name="is_published" defaultChecked={post?.is_published === 1} /> Published (visible on the site)
            </label>
          </div>
        </div>

        {formState.error && <p className="pr-dash-error">{formState.error}</p>}
        {formState.saved && (
          <p className="pr-dash-field-hint" style={{ color: "var(--green)" }}>
            Saved.
          </p>
        )}

        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {onDelete && (
            <button type="button" className="pr-dash-btn pr-dash-btn-danger" onClick={handleDeleteClick} disabled={deletePending}>
              {deletePending ? "Deleting..." : "Delete post"}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
