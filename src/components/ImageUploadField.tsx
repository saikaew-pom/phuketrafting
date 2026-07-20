"use client";

import { useState } from "react";
import Image from "next/image";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";
import { MediaPicker } from "@/components/MediaPicker";

interface Props {
  /** Form field name the resulting Cloudinary public_id is submitted under. */
  name: string;
  initialPublicId: string | null;
  label: string;
}

// Unsigned direct-to-Cloudinary upload -- no server round-trip for the file
// itself, no secret in the client (see plan §1a). Renders a hidden input so
// the public_id submits as part of the surrounding <form> like any other field.
export function ImageUploadField({ name, initialPublicId, label }: Props) {
  const [publicId, setPublicId] = useState(initialPublicId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }
      const data = (await response.json()) as { public_id: string };
      setPublicId(data.public_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", flexWrap: "wrap" }}>
        {publicId && (
          <Image
            src={publicId}
            alt=""
            width={120}
            height={80}
            style={{ objectFit: "cover", borderRadius: "4px" }}
          />
        )}
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
        <button
          type="button"
          className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
          onClick={() => setPickerOpen(true)}
        >
          Choose from gallery
        </button>
      </div>
      <input type="hidden" name={name} value={publicId ?? ""} />
      {uploading && <p>Uploading…</p>}
      {error && <p style={{ color: "#e8590c" }}>{error}</p>}
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setPublicId(id);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
