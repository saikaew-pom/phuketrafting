"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateChromeTranslationsAction, generateHomepageTranslationsAction } from "./actions";

export interface LocaleRow {
  locale: string;
  label: string;
  translatedCount: number;
  totalCount: number;
  lastGeneratedText: string | null;
  isStale: boolean;
}

/**
 * "Generate" is an RPC call (not a <form action>), same pattern as the
 * gallery's "Suggest caption" button -- it's a client-side click that writes
 * straight to D1 and then refreshes the server-rendered status below it,
 * rather than filling a field a human reviews before saving.
 */
export function TranslationsTable({ rows, kind }: { rows: LocaleRow[]; kind: "chrome" | "homepage" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleGenerate(locale: string) {
    setBusy(locale);
    setErrors((prev) => ({ ...prev, [locale]: "" }));
    const result =
      kind === "chrome"
        ? await generateChromeTranslationsAction(locale)
        : await generateHomepageTranslationsAction(locale);
    setBusy(null);
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [locale]: result.error ?? "Generation failed." }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="pr-dash-tablewrap">
      <table className="pr-dash-table">
        <thead>
          <tr>
            <th>Language</th>
            <th>Coverage</th>
            <th>Last generated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.locale}>
              <td>{row.label}</td>
              <td>
                {row.translatedCount}/{row.totalCount}
              </td>
              <td>
                {row.lastGeneratedText ?? <span className="pr-dash-field-hint">Never generated</span>}
                {row.isStale && (
                  <div>
                    <span className="pr-dash-badge pr-dash-badge-warn">English changed since</span>
                  </div>
                )}
              </td>
              <td>
                <div className="pr-dash-actions">
                  <button
                    type="button"
                    className="pr-dash-btn pr-dash-btn-ghost pr-dash-btn-sm"
                    onClick={() => handleGenerate(row.locale)}
                    disabled={busy === row.locale}
                  >
                    {busy === row.locale ? "Generating…" : row.translatedCount > 0 ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {errors[row.locale] && (
                  <div style={{ color: "var(--accent)", fontSize: "12.5px", marginTop: "4px" }}>{errors[row.locale]}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
