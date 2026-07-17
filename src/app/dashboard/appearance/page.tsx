import { requireAdmin } from "@/lib/access";
import { getTheme, getLogo } from "@/lib/queries/settings";
import { AppearanceForm } from "./AppearanceForm";

const ERROR_MESSAGES: Record<string, string> = {
  bad_color: "That isn't a valid colour. Pick one from the swatches or the colour picker.",
};

/** Homepage CMS -- appearance stage: brand colour + logo, staff-editable. */
export default async function AppearancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  // Admin-gated like Settings -- changes the whole public brand.
  await requireAdmin();
  const { error, saved } = await searchParams;
  const [theme, logo] = await Promise.all([getTheme(), getLogo()]);
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Appearance</h1>
        <p>Your brand colour and logo. Changes apply across the whole public site.</p>
      </div>

      {saved && (
        <div className="pr-dash-card" style={{ borderColor: "var(--green)", marginBottom: "16px" }}>
          <span className="pr-dash-badge pr-dash-badge-ok">Saved</span> Appearance updated.
        </div>
      )}
      {errorMessage && (
        <div className="pr-dash-card" style={{ borderColor: "var(--accent-dark)", marginBottom: "16px" }}>
          <p className="pr-dash-error" style={{ margin: 0 }}>{errorMessage}</p>
        </div>
      )}

      <AppearanceForm theme={theme} logo={logo} />
    </div>
  );
}
