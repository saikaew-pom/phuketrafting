import Script from "next/script";

// Consent Mode v2 (plan §7): the 'default' command -- denying everything --
// MUST run before gtag.js itself loads, so it's a raw inline <script> (NOT
// next/script) that executes in document order during HTML parse -- which is
// before any afterInteractive script (gtag.js) loads. This deliberately does
// NOT use next/script's beforeInteractive: that strategy is only honored in
// the ROOT app/layout, and this component renders from the nested [lang]
// layout, where beforeInteractive silently degrades and the consent-default
// is no longer guaranteed to run before gtag.js -- which would let GA set
// cookies before consent (PDPA exposure). The inline script's payload is a
// fixed constant (no interpolation), so dangerouslySetInnerHTML carries no
// injection surface. (Audit A18.)
export function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied'
          });
        `,
        }}
      />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          // page_location defaults to the full location.href, which on
          // /[lang]/manage/[token] IS the guest's manage_token -- a real
          // capability (cancel/reschedule, waiver submission), sent to Google
          // as a cookieless ping BEFORE any consent choice, since Consent
          // Mode's analytics_storage:'denied' above suppresses cookies, not
          // transmission. Redacting the token segment here means the token
          // never leaves the browser via GA4, on every page, without this
          // component needing to know which routes are token-bearing.
          // location.hash is appended back on unredacted -- omitting it here
          // would silently drop landing-section granularity (the homepage's
          // #tours/#why/#contact anchors, which next.config.ts's legacy
          // redirect map sends real traffic to) for every page, not just
          // /manage/[token]. Confirmed live: without this, /en#tours reported
          // page_location "/en", losing the #tours part GA4's own default
          // (bare location.href) would have sent.
          gtag('config', '${measurementId}', {
            page_location: location.origin + location.pathname.replace(/\\/manage\\/[^/]+/, '/manage/[token]') + location.search + location.hash
          });
        `}
      </Script>
    </>
  );
}
