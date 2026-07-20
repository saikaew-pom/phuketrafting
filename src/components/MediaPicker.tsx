"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { listMediaLibraryAction, type LibraryImage } from "@/app/dashboard/media-actions";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (publicId: string) => void;
}

/**
 * "Choose from gallery" modal for ImageUploadField -- browse/search the
 * gallery library and pick an already-uploaded photo instead of uploading a
 * new one. Fetches lazily (only once the modal actually opens) rather than on
 * every ImageUploadField mount -- this component shows up on 7+ dashboard
 * screens, most visits never open the picker.
 *
 * Refetches on EVERY open, not just the first: confirmed live that caching
 * across opens shows stale data indefinitely for a long-lived page (open the
 * picker, close without picking, tag/upload a photo elsewhere, reopen the
 * SAME picker -- it kept showing the pre-change snapshot forever). The
 * `cancelled` guard below means an open/close/reopen while a fetch is still
 * in flight can't let a stale response overwrite a newer one, and can't set
 * state after this instance has unmounted (e.g. the user navigated away
 * mid-fetch).
 */
export function MediaPicker({ open, onClose, onSelect }: Props) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMediaLibraryAction()
      .then((imgs) => {
        if (cancelled) return;
        setImages(imgs);
        setError(null); // clears a previous failed attempt's message once a retry succeeds
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the gallery -- try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Dialog a11y -- same pattern as CompareTable.tsx (Audit A28): Escape
  // closes it, focus moves into the dialog on open (to the close button) and
  // returns to whatever triggered it on close, so a keyboard user isn't
  // stranded behind an aria-modal overlay. Kept in its own effect keyed only
  // on `open` (not `onClose`, which ImageUploadField passes as a fresh
  // closure every render) so an unrelated re-render of the field while the
  // picker is open can't yank focus back to the close button out from under
  // someone who has already tabbed into the search box or a photo.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = (images ?? []).filter(
    (img) => !q || (img.label ?? "").toLowerCase().includes(q) || img.tags.some((t) => t.toLowerCase().includes(q))
  );

  return (
    <div
      className="pr-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose from gallery"
      onClick={onClose}
    >
      <div
        className="pr-dash-card"
        style={{ width: "100%", maxWidth: "720px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pr-dash-actions" style={{ justifyContent: "space-between", marginBottom: "10px" }}>
          <h2 style={{ margin: 0 }}>Choose from gallery</h2>
          <button
            ref={closeRef}
            type="button"
            className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {images !== null && images.length > 0 && (
          <input
            placeholder="Search by caption or tag..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: "12px" }}
          />
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Gated on images === null (nothing usable cached yet), not just
              `error`: reopening the picker refetches every time (see effect
              above), and a refresh that fails while a previous successful
              load is still cached should keep showing that cached grid
              rather than bury it under a "couldn't load" message that isn't
              true anymore. */}
          {error && images === null && <p style={{ color: "var(--accent)" }}>{error}</p>}
          {!error && images === null && <p className="pr-dash-field-hint">Loading…</p>}
          {images !== null && images.length === 0 && (
            <p className="pr-dash-field-hint">The gallery is empty -- upload some photos on the Gallery screen first.</p>
          )}
          {images !== null && images.length > 0 && filtered.length === 0 && (
            <p className="pr-dash-field-hint">No photos match &quot;{query}&quot;.</p>
          )}
          {filtered.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
              {filtered.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onSelect(img.imageId)}
                  title={img.label ?? ""}
                  aria-label={img.label || "Untitled gallery photo"}
                  style={{
                    padding: 0,
                    border: "1px solid var(--line-2)",
                    borderRadius: "6px",
                    overflow: "hidden",
                    cursor: "pointer",
                    lineHeight: 0,
                  }}
                >
                  <Image
                    src={img.imageId}
                    alt=""
                    width={160}
                    height={110}
                    style={{ width: "100%", height: "80px", objectFit: "cover", display: "block" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
