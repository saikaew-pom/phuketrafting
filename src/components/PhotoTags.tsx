"use client";

import { useRef, useState } from "react";
import { setImageTagsAction } from "@/app/dashboard/gallery/actions";

interface Props {
  imageId: string;
  allTags: { id: string; name: string }[];
  initialTagIds: string[];
}

/**
 * Toggleable tag chips on one gallery photo row. Each click immediately
 * submits the resulting full tag set (setImageTags replaces, it doesn't
 * diff) -- same "every action is its own atomic operation, no separate Save
 * step" shape as the row's reorder/remove buttons, not a form staff fill out
 * and submit.
 *
 * Reuses pr-dash-btn/pr-dash-btn-ghost as the chip's on/off states rather
 * than introducing new CSS -- the same two classes already mean "selected"
 * vs "not" everywhere else in this dashboard.
 */
export function PhotoTags({ imageId, allTags, initialTagIds }: Props) {
  const [tagIds, setTagIds] = useState<Set<string>>(new Set(initialTagIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous guard, checked/armed BEFORE any await -- `busy` state alone
  // isn't enough. React doesn't commit the first click's setBusy(true) to the
  // DOM before a second click dispatched in the same synchronous turn (e.g. a
  // fast click on tag A immediately followed by a click on tag B) already ran:
  // confirmed live that both onClick calls read the SAME stale `tagIds`
  // closure, so the second call's `next` set didn't include the first call's
  // change, and the two resulting setImageTagsAction calls raced each other --
  // whichever finished last silently won, dropping the other tag with no
  // error shown. A ref is checked/set synchronously (no render in between),
  // so it closes the window a boolean *state* flag leaves open -- same reason
  // EditableCaption.tsx uses labelRef instead of trusting `label` inside an
  // async handler.
  const busyRef = useRef(false);

  async function toggle(tagId: string) {
    if (busyRef.current) return; // a request is already in flight -- ignore
    busyRef.current = true;

    const previous = tagIds;
    const next = new Set(tagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);

    setTagIds(next); // optimistic
    setBusy(true);
    setError(null);
    const result = await setImageTagsAction(imageId, Array.from(next));
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) {
      setTagIds(previous); // revert -- the click didn't actually take
      setError(result.error ?? "Couldn't update tags.");
    }
  }

  if (allTags.length === 0) {
    return <span className="pr-dash-field-hint">No tags yet</span>;
  }

  return (
    <div style={{ minWidth: "180px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {allTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            disabled={busy}
            className={"pr-dash-btn pr-dash-btn-sm" + (tagIds.has(tag.id) ? "" : " pr-dash-btn-ghost")}
          >
            {tag.name}
          </button>
        ))}
      </div>
      {error && (
        <span style={{ color: "var(--accent)", fontSize: "12.5px", display: "block", marginTop: "4px" }}>{error}</span>
      )}
    </div>
  );
}
