"use client";

import { useTransition } from "react";

interface Props {
  tagName: string;
  usageCount: number;
  onDelete: () => Promise<void>;
}

/**
 * Confirms before deleting a tag -- same confirm()+useTransition pattern as
 * BlogEditorClient.tsx's/ReviewForm.tsx's "Delete post"/"Delete review"
 * buttons (both: `if (!confirm(...)) return; startDeleteTransition(() => {
 * onDelete(); });`), reused here rather than inventing a new confirmation
 * mechanism.
 *
 * Unlike a blog post or review, deleteTag has no server-side "can't delete
 * while in use" guard (see its doc comment in lib/queries/tags.ts) -- it
 * cascades silently via ON DELETE CASCADE, untagging every photo that had it
 * in one click, with no undo. On a heavily-tagged gallery that's a real
 * "oops" waiting to happen, so it gets the same confirm step this codebase
 * already uses for other no-undo deletes -- the usage count (already fetched
 * for the "N photos" column) is folded into the prompt so staff see the blast
 * radius before confirming, not just the tag's name.
 */
export function DeleteTagButton({ tagName, usageCount, onDelete }: Props) {
  const [pending, startDeleteTransition] = useTransition();

  function handleDelete() {
    const usageWarning =
      usageCount > 0 ? ` It's used on ${usageCount} photo${usageCount === 1 ? "" : "s"} -- they'll all be untagged.` : "";
    if (!confirm(`Delete the tag "${tagName}"?${usageWarning} This cannot be undone.`)) return;
    startDeleteTransition(() => {
      onDelete();
    });
  }

  return (
    <button type="button" className="pr-dash-btn pr-dash-btn-danger pr-dash-btn-sm" onClick={handleDelete} disabled={pending}>
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
