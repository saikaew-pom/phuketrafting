"use client";

import { useActionState } from "react";
import { MultiImageUploadField } from "@/components/MultiImageUploadField";
import { saveGalleryImages } from "@/app/dashboard/gallery/actions";

/**
 * Wraps MultiImageUploadField in the <form>/submit-button + useActionState
 * plumbing -- same shape as BlogEditorClient.tsx's form. Needed for one
 * reason: saveGalleryImages returns a save counter (see its own comment), and
 * `key={saveCount}` below remounts MultiImageUploadField after every
 * successful save, resetting its internal `rows` back to empty.
 *
 * Without this, the field's `rows` state kept showing already-saved photos
 * after a successful submit (a plain <form action={fn}> gives a child
 * component no way to learn the submit succeeded) -- confirmed live that
 * clicking "Save to gallery" again, or just adding a follow-up batch later in
 * the same sitting, resubmitted the old rows and duplicated every photo
 * already in the gallery. `disabled={saving}` on the button additionally
 * blocks the plain rapid-double-click variant of the same bug.
 */
export function GalleryUploadForm() {
  const [saveCount, formAction, saving] = useActionState(saveGalleryImages, 0);

  return (
    <form action={formAction} className="pr-dash-form">
      <MultiImageUploadField key={saveCount} name="images" />
      <div className="pr-dash-actions">
        <button type="submit" className="pr-dash-btn" disabled={saving}>
          {saving ? "Saving..." : "Save to gallery"}
        </button>
      </div>
    </form>
  );
}
