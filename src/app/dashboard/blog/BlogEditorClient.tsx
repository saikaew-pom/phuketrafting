"use client";

import { useState, useTransition } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { BLOG_CATEGORIES, type BlogPost } from "@/lib/queries/blog";
import { generateDraftAction, generateExcerptAction } from "./actions";

const fieldStyle: React.CSSProperties = { display: "block", width: "100%" };

interface Props {
  post: BlogPost | null; // null = new post
  action: (formData: FormData) => void;
  onDelete?: () => Promise<void>;
}

export function BlogEditorClient({ post, action, onDelete }: Props) {
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
      <form action={action} style={{ maxWidth: "720px", display: "grid", gap: "12px" }}>
        <label>
          Title
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required style={fieldStyle} />
        </label>
        <label>
          Slug (leave blank to generate from the title)
          <input name="slug" defaultValue={post?.slug ?? ""} style={fieldStyle} />
        </label>
        <label>
          Category
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
            {BLOG_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Author
          <input name="author" defaultValue={post?.author ?? ""} placeholder="Defaults to your staff name" style={fieldStyle} />
        </label>
        <ImageUploadField name="cover_image_id" initialPublicId={post?.cover_image_id ?? null} label="Cover image" />

        <div>
          <button type="button" onClick={handleGenerateDraft} disabled={draftBusy || excerptBusy}>
            {draftBusy ? "Writing..." : "Write draft with AI"}
          </button>
          <span style={{ marginLeft: "8px", color: "#666" }}>Fills the body below -- always review before publishing.</span>
        </div>
        <label>
          Body (markdown -- ## headings, **bold**, - bullets, [text](url) links)
          <textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={20}
            style={{ ...fieldStyle, fontFamily: "monospace" }}
          />
        </label>

        <div>
          <button type="button" onClick={handleGenerateExcerpt} disabled={draftBusy || excerptBusy}>
            {excerptBusy ? "Writing..." : "Generate excerpt with AI"}
          </button>
        </div>
        <label>
          Excerpt (shown on the blog list page)
          <textarea name="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} style={fieldStyle} />
        </label>

        {aiError && <p style={{ color: "crimson" }}>{aiError}</p>}

        <label>
          <input type="checkbox" name="featured" defaultChecked={post?.featured === 1} /> Featured
        </label>
        <label>
          <input type="checkbox" name="is_published" defaultChecked={post?.is_published === 1} /> Published
        </label>

        <button type="submit" style={{ padding: "8px 16px", marginTop: "8px" }}>
          Save
        </button>
      </form>

      {onDelete && (
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={deletePending}
          style={{ marginTop: "24px", color: "crimson" }}
        >
          {deletePending ? "Deleting..." : "Delete post"}
        </button>
      )}
    </>
  );
}
