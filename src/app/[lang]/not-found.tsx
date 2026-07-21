import Link from "next/link";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { waLink } from "@/lib/whatsapp";

// Next.js does not pass params to not-found.tsx (confirmed against this
// version's own bundled docs, node_modules/next/dist/docs/.../not-found.md:
// "not-found.js ... components do not accept any props") -- so this can't
// know which locale the guest was on. Renders inside [lang]/layout.tsx (same
// segment, same component-hierarchy position as page.tsx), so the Nav/Footer
// chrome IS still locale-correct; only this file's own links fall back to
// DEFAULT_LOCALE rather than trying to guess.
//
// Confirmed live which notFound() calls this actually catches, since the two
// classes behave differently: notFound() thrown by a LEAF page nested under
// [lang] -- a deleted blog slug, an invalid manage-booking token -- correctly
// renders this file (verified: /en/blog/<missing-slug> shows this exact
// content). notFound() thrown by [lang]/layout.tsx ITSELF (the
// !isSupportedLocale(lang) guard, for a URL like /xx) does NOT -- a layout
// that throws before rendering has no {children} slot left for a sibling
// not-found.tsx to fill, so it (and any totally unmatched path with no
// leaf route at all) still falls through to Next's bare built-in 404. That
// gap is pre-existing, not a regression this file introduces -- no
// not-found.tsx existed anywhere in the app before it, at any level. Closing
// it fully would need the experimental global-not-found.js convention
// (next.config.ts's `experimental.globalNotFound`), which bypasses normal
// layout nesting and needs its own full <html>/<body> -- deliberately not
// taken on here alongside an already-large layout restructuring.
export default function NotFound() {
  return (
    <article className="pr-legal">
      <div className="pr-wrap pr-wrap-narrow">
        <h1>Page not found</h1>
        <p className="pr-legal-updated">
          That page doesn&apos;t exist, or it may have moved.
        </p>
        <p>
          <Link href={`/${DEFAULT_LOCALE}`}>Back to the homepage</Link> or{" "}
          <Link href={`/${DEFAULT_LOCALE}#tours`}>browse our tours</Link>. If you followed a link that should have
          worked, message us on{" "}
          <a href={waLink("Hi! A link on your site sent me to a page that doesn't exist.")} target="_blank" rel="noreferrer">
            WhatsApp
          </a>{" "}
          and we&apos;ll fix it.
        </p>
      </div>
    </article>
  );
}
