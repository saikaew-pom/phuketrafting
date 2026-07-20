"use client";

import { useEffect, useRef, useState } from "react";
import { updateGalleryCaptionAction, suggestCaptionAction } from "@/app/dashboard/gallery/actions";

interface Props {
  imageId: string;
  initialLabel: string | null;
}

/**
 * The caption cell in the gallery's saved-photos table -- editable after the
 * fact, with the same "type a hint, AI suggests" flow MultiImageUploadField
 * offers at upload time (gallery-ai.ts is text-only, from a staff-typed hint,
 * not the photo's actual pixels -- see its own doc comment). The hint itself
 * is never persisted, only the resulting caption is, same as at upload time.
 */
export function EditableCaption({ imageId, initialLabel }: Props) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors `label` so the async handlers below can read the CURRENT value
  // after an `await` -- a plain closure over `label` is frozen at whatever it
  // was when the render that created the closure ran, so without this a
  // handler has no way to tell the caption changed while it was waiting on a
  // network round trip. Both handlers rely on it to avoid clobbering, or
  // lying about, a change that happened while they were in flight. Synced via
  // effect, not written during render -- react-hooks/refs (this repo's eslint
  // config) flags a ref write in the render body itself.
  const labelRef = useRef(label);
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  async function handleSuggest() {
    if (!hint.trim()) {
      setError('Type a short hint first, e.g. "guests paddling through rapids".');
      return;
    }
    const labelBeforeRequest = labelRef.current;
    setSuggesting(true);
    setError(null);
    try {
      const result = await suggestCaptionAction(hint);
      setSuggesting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      // If the caption changed while the AI call was in flight -- the staff
      // member typed their own caption and/or already saved it instead of
      // waiting -- applying this response now would silently overwrite that
      // with a suggestion nobody asked to see anymore. Confirmed live: typing
      // a manual caption and saving it while an earlier Suggest call was
      // still pending got silently reverted to the AI text the moment that
      // call resolved, with the "Saved" badge still showing next to it --
      // even though D1 held the manually-typed text, not this one.
      if (labelRef.current !== labelBeforeRequest) return;
      setLabel(result.text ?? label);
      setSaved(false);
    } catch (err) {
      // suggestCaptionAction itself now catches its own failures (including
      // requireStaff() throwing) and returns {error} rather than rejecting --
      // see its doc comment in actions.ts, fixed alongside this for the same
      // reason. This try/catch is what exposed the gap in the first place:
      // before that fix, requireStaff() failing (expired/invalid session,
      // deactivated account) escaped as an unhandled rejection with nowhere
      // to go here, so setSuggesting(false) was never reached and the button
      // was stuck on "Writing..." forever with zero feedback -- confirmed
      // live by deactivating the signed-in staff row mid-session and clicking
      // Suggest. Kept as a safety net for the RPC call itself failing (e.g. a
      // network error), which no server-side fix can catch. Same
      // catch-and-stringify shape as handleSave's below, for the same reason.
      setSuggesting(false);
      setError(err instanceof Error ? err.message : "Couldn't get a suggestion -- try again.");
    }
  }

  async function handleSave() {
    const labelBeingSaved = label;
    setSaving(true);
    setError(null);
    const result = await updateGalleryCaptionAction(imageId, labelBeingSaved);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save -- try again.");
      return;
    }
    // Only claim "Saved" if the box still shows exactly the text this call
    // persisted. A slow save can be overtaken by a Suggest response (or more
    // typing) landing first -- showing "Saved" then would describe D1
    // incorrectly, next to text that was never sent.
    if (labelRef.current === labelBeingSaved) setSaved(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "220px" }}>
      <input
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          setSaved(false);
        }}
        placeholder="(no caption)"
        maxLength={120}
      />

      {showHint ? (
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            placeholder="Hint for AI, e.g. guests paddling through rapids"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
            onClick={handleSuggest}
            disabled={suggesting}
          >
            {suggesting ? "Writing…" : "Suggest"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
          onClick={() => setShowHint(true)}
          style={{ alignSelf: "flex-start" }}
        >
          Suggest with AI
        </button>
      )}

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button type="button" className="pr-dash-btn pr-dash-btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span style={{ color: "var(--green)", fontSize: "12.5px" }}>Saved</span>}
      </div>

      {error && <span style={{ color: "var(--accent)", fontSize: "12.5px" }}>{error}</span>}
    </div>
  );
}
