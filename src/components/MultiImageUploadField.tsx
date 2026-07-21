"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { suggestCaptionAction } from "@/app/dashboard/gallery/actions";

interface Row {
  publicId: string;
  hint: string;
  label: string;
  suggesting: boolean;
  error: string | null;
}

interface Props {
  /** Form field name the resulting JSON array of {image_id,label} submits under. */
  name: string;
}

/**
 * Multiple-photo sibling of ImageUploadField.tsx -- same unsigned
 * direct-to-Cloudinary upload (no server round-trip for the file, no secret
 * in the client), extended to N files at once with a per-photo caption and an
 * AI "Suggest caption" button (see lib/gallery-ai.ts: text-only, generated
 * from a staff-typed hint, not from the photo's actual pixels).
 *
 * Single current caller (the gallery CMS), so suggestCaptionAction is
 * imported directly rather than taken as a prop -- if a second multi-upload
 * screen needs this later, that's the point to lift it to a prop.
 */
export function MultiImageUploadField({ name }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  // Synchronous guard against a double-click firing two AI calls for the same
  // row before React commits the first `suggesting: true` -- state alone
  // isn't enough, since two clicks in the same synchronous turn both read
  // `suggesting: false` before either setState takes effect (same reasoning
  // as PhotoTags.tsx's busyRef / EditableCaption.tsx's labelRef). A Set, not
  // a single boolean, because unlike those two this component has many rows
  // that can each independently be mid-suggestion at once -- keyed by
  // publicId for the same stable-identity reason updateRow already is.
  const suggestingRef = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      // allSettled, not all: every file here already reaches Cloudinary
      // independently, so one flaky upload in a batch of N must not discard
      // the other N-1 that succeeded. Promise.all rejects the WHOLE batch as
      // soon as any single upload fails, and the fulfilled results are never
      // delivered to the caller -- so a single transient failure used to
      // silently drop every already-uploaded photo from `rows`, leaving them
      // as orphaned Cloudinary assets the UI never shows and staff have to
      // re-upload from scratch.
      const results = await Promise.allSettled(
        Array.from(files).map(async (file) => {
          const body = new FormData();
          body.append("file", file);
          body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
          const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: "POST",
            body,
          });
          if (!response.ok) throw new Error(`Upload failed (${response.status})`);
          const data = (await response.json()) as { public_id: string };
          return data.public_id;
        })
      );

      const succeeded = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
      const failedCount = results.length - succeeded.length;

      if (succeeded.length > 0) {
        setRows((prev) => [
          ...prev,
          ...succeeded.map((r) => ({ publicId: r.value, hint: "", label: "", suggesting: false, error: null })),
        ]);
      }
      setUploadError(
        failedCount > 0
          ? `${failedCount} of ${results.length} photo${results.length === 1 ? "" : "s"} failed to upload${succeeded.length > 0 ? " -- the rest were added below" : ""}. Try the missing one${failedCount === 1 ? "" : "s"} again.`
          : null
      );
    } finally {
      setUploading(false);
      // Clears the picker so selecting the same file(s) again later re-fires onChange.
      event.target.value = "";
    }
  }

  // Keyed by publicId, not array index. handleSuggest is async and awaits a
  // server round-trip; if the user removes an earlier row while a suggestion
  // is in flight, every row after it shifts to a new index. An index
  // captured before the `await` would then resolve against whatever row now
  // sits at that position -- silently writing one photo's AI caption onto a
  // DIFFERENT photo, while the row that actually asked for it stays stuck
  // showing "Writing...". publicId is stable for a row's whole lifetime, so
  // it can't be invalidated by an unrelated removal mid-request.
  function updateRow(publicId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.publicId === publicId ? { ...r, ...patch } : r)));
  }

  function removeRow(publicId: string) {
    setRows((prev) => prev.filter((r) => r.publicId !== publicId));
  }

  async function handleSuggest(publicId: string) {
    if (suggestingRef.current.has(publicId)) return; // already in flight for this row
    const row = rows.find((r) => r.publicId === publicId);
    if (!row) return; // removed while an earlier suggestion for it was still in flight
    if (!row.hint.trim()) {
      updateRow(publicId, { error: 'Type a short hint first, e.g. "guests paddling through rapids".' });
      return;
    }
    suggestingRef.current.add(publicId);
    updateRow(publicId, { suggesting: true, error: null });
    const result = await suggestCaptionAction(row.hint);
    suggestingRef.current.delete(publicId);
    if (result.error) {
      updateRow(publicId, { suggesting: false, error: result.error });
      return;
    }
    updateRow(publicId, { suggesting: false, label: result.text ?? row.label });
  }

  const payload = JSON.stringify(rows.map((r) => ({ image_id: r.publicId, label: r.label })));

  return (
    <div>
      <label>Photos</label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesChange}
        disabled={uploading}
        style={{ display: "block", marginTop: "6px" }}
      />
      {uploading && <p className="pr-dash-field-hint">Uploading…</p>}
      {uploadError && <p style={{ color: "var(--accent)" }}>{uploadError}</p>}

      {rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
          {rows.map((row) => (
            <div
              key={row.publicId}
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                padding: "10px",
                border: "1px solid var(--line-2)",
                borderRadius: "8px",
              }}
            >
              <Image
                src={row.publicId}
                alt=""
                width={96}
                height={64}
                style={{ objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    placeholder="Hint for AI, e.g. guests paddling through rapids"
                    value={row.hint}
                    onChange={(e) => updateRow(row.publicId, { hint: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
                    onClick={() => handleSuggest(row.publicId)}
                    disabled={row.suggesting}
                  >
                    {row.suggesting ? "Writing…" : "Suggest caption"}
                  </button>
                </div>
                <input
                  placeholder="Caption (shown on the site, read by screen readers)"
                  maxLength={120}
                  value={row.label}
                  onChange={(e) => updateRow(row.publicId, { label: e.target.value })}
                />
                {row.error && <span style={{ color: "var(--accent)", fontSize: "12.5px" }}>{row.error}</span>}
              </div>
              <button
                type="button"
                className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
                onClick={() => removeRow(row.publicId)}
                aria-label="Remove this photo"
                title="Remove this photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input type="hidden" name={name} value={payload} />
    </div>
  );
}
